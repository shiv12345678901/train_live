import { create } from 'zustand';
import { collection, onSnapshot, orderBy, query, type Unsubscribe } from 'firebase/firestore';
import type { RouteCard, TrainDeparture, AlertSchedule, AlertPrefillData, AppSettings, TransportMode } from '@/types';
import { fetchRouteCards, createRouteCard, deleteRouteCard as apiDeleteRouteCard, updateRouteOrder, updateRouteCard as apiUpdateRouteCard } from '@/api/routeApi';
import { fetchLiveTrains as apiFetchLiveTrains } from '@/api/trainApi';
import { PRESET_STOPS } from '@/data/stops';
import { fetchSchedules, createSchedule, updateSchedule, deleteSchedule as apiDeleteSchedule } from '@/api/scheduleApi';
import { saveSettings } from '@/api/settingsApi';
import { DEFAULT_USER_ID } from '@/api/client';
import { clientFirestore, isFirebaseRealtimeConfigured } from '@/lib/firebaseClient';
import {
  getLocalRouteCards, setLocalRouteCards,
  getLocalAlertSchedules, setLocalAlertSchedules,
  getLocalSettings, setLocalSettings,
  addPendingOp, getPendingOps, removePendingOp, removePendingOps, updatePendingOp,
  setLastSyncTime,
  getCachedLiveTrains, getCachedLiveTrainUpdatedAt, setCachedRouteLiveTrains,
} from './localStorage';

interface AppState {
  // Route Cards
  routeCards: RouteCard[];
  loadRouteCards: () => Promise<void>;
  saveRouteCard: (card: Omit<RouteCard, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateRouteCard: (id: string, updates: Partial<RouteCard>) => Promise<void>;
  reorderRouteCards: (cardIds: string[]) => Promise<void>;
  deleteRouteCard: (id: string) => Promise<void>;

  // Live Trains (per route, cached)
  liveTrains: Record<string, TrainDeparture[]>;
  liveTrainsLoading: Record<string, boolean>;
  liveTrainsError: Record<string, string | null>;
  liveTrainsUpdatedAt: Record<string, string>;
  fetchLiveTrains: (routeId: string, limit?: number, force?: boolean) => Promise<void>;
  refreshAllData: (force?: boolean) => Promise<void>;
  startRealtimeSync: () => () => void;

  // Alert Schedules
  alertSchedules: AlertSchedule[];
  loadAlertSchedules: () => Promise<void>;
  saveAlertSchedule: (schedule: Omit<AlertSchedule, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateAlertSchedule: (id: string, updates: Partial<AlertSchedule>) => Promise<void>;
  toggleAlertSchedule: (id: string, enabled: boolean) => Promise<void>;
  deleteAlertSchedule: (id: string) => Promise<void>;

  // Navigation Context (bell icon → schedule prefill)
  pendingAlertPrefill: AlertPrefillData | null;
  setPendingAlertPrefill: (data: AlertPrefillData | null) => void;

  // Settings
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;

  // Sync
  isSyncing: boolean;
  realtimeEnabled: boolean;
  syncPendingOps: () => Promise<void>;
}

/**
 * Generate a local ID for offline-created items.
 */
function generateLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const APP_VISIBLE_REFRESH_MS = 15_000;
const LIVE_TRAIN_MIN_REFRESH_MS = 12_000;
const LIVE_TRAIN_BATCH_DELAY_MS = 250;
const lastLiveTrainFetchAt = new Map<string, number>();

let realtimeUnsubscribe: (() => void) | null = null;
let refreshAllPromise: Promise<void> | null = null;

function asRouteCard(doc: { id: string; data: () => unknown }): RouteCard {
  return { id: doc.id, ...(doc.data() as Omit<RouteCard, 'id'>) };
}

function asAlertSchedule(doc: { id: string; data: () => unknown }): AlertSchedule {
  return { id: doc.id, ...(doc.data() as Omit<AlertSchedule, 'id'>) };
}

function pendingDeletedIds(type: 'delete_route' | 'delete_schedule'): Set<string> {
  return new Set(getPendingOps()
    .filter((op) => op.type === type)
    .map((op) => (op.payload as { id?: string }).id)
    .filter((id): id is string => Boolean(id)));
}

function removePendingEntityOps(entity: 'route' | 'schedule', id: string): void {
  removePendingOps((op) => {
    const payload = op.payload as { id?: string; localId?: string; cardIds?: string[] };
    if (entity === 'route') {
      return (
        (op.type === 'create_route' && payload.localId === id) ||
        (op.type === 'update_route' && payload.id === id) ||
        (op.type === 'reorder_routes' && Array.isArray(payload.cardIds) && payload.cardIds.includes(id))
      );
    }

    return (
      (op.type === 'create_schedule' && payload.localId === id) ||
      (op.type === 'update_schedule' && payload.id === id)
    );
  });
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

function mergePendingLocalCreate(entity: 'route' | 'schedule', localId: string, updates: Record<string, unknown>): boolean {
  let merged = false;
  for (const op of getPendingOps()) {
    const payload = op.payload as { localId?: string; card?: Record<string, unknown>; schedule?: Record<string, unknown> };
    if (entity === 'route' && op.type === 'create_route' && payload.localId === localId && payload.card) {
      updatePendingOp(op.id, { payload: { ...payload, card: { ...payload.card, ...updates } } });
      merged = true;
    }
    if (entity === 'schedule' && op.type === 'create_schedule' && payload.localId === localId && payload.schedule) {
      updatePendingOp(op.id, { payload: { ...payload, schedule: { ...payload.schedule, ...updates } } });
      merged = true;
    }
  }
  return merged;
}

function remapPendingRouteReferences(localId: string, remoteId: string): void {
  for (const op of getPendingOps()) {
    const payload = op.payload as Record<string, unknown>;

    if (op.type === 'create_schedule' && payload.schedule && typeof payload.schedule === 'object') {
      const schedule = payload.schedule as Record<string, unknown>;
      if (schedule.routeCardId === localId) {
        updatePendingOp(op.id, { payload: { ...payload, schedule: { ...schedule, routeCardId: remoteId } } });
      }
    }

    if (op.type === 'update_schedule' && payload.updates && typeof payload.updates === 'object') {
      const updates = payload.updates as Record<string, unknown>;
      if (updates.routeCardId === localId) {
        updatePendingOp(op.id, { payload: { ...payload, updates: { ...updates, routeCardId: remoteId } } });
      }
    }

    if ((op.type === 'update_route' || op.type === 'delete_route') && payload.id === localId) {
      updatePendingOp(op.id, { payload: { ...payload, id: remoteId } });
    }

    if (op.type === 'reorder_routes' && Array.isArray(payload.cardIds)) {
      const cardIds = payload.cardIds.map((id) => id === localId ? remoteId : id);
      updatePendingOp(op.id, { payload: { ...payload, cardIds } });
    }
  }
}

/**
 * Infer transport mode from station/stop names.
 * - "Station" in name → train (or metro if metro station)
 * - "Wharf" → ferry
 * - "Light Rail" → light_rail
 * - Bus stop names (street addresses, "Stand", "opp", "nr") → bus
 * - Metro stations → metro
 */
function inferModeFromStops(origin?: string, destination?: string): TransportMode {
  const o = (origin || '').toLowerCase();
  const d = (destination || '').toLowerCase();
  const both = `${o} ${d}`;

  // Ferry
  if (o.includes('wharf') || d.includes('wharf')) return 'ferry';

  // Light Rail
  if (o.includes('light rail') || d.includes('light rail')) return 'light_rail';

  // Metro — specific metro station names or "(Metro)" suffix
  const metroKeywords = ['tallawong', 'rouse hill', 'castle hill', 'norwest', 'bella vista', 'cherrybrook', 'macquarie university', 'macquarie park', 'north ryde', '(metro)'];
  if (metroKeywords.some(k => both.includes(k))) return 'metro';

  // Bus — no "Station" in either name, or contains bus stop patterns
  const busPatterns = ['stand', 'opp ', 'nr ', 'before ', 'after ', 'hwy', 'rd,', 'st,', 'ave,'];
  const hasStation = o.includes('station') || d.includes('station');
  const hasBusPattern = busPatterns.some(p => both.includes(p));

  if (!hasStation && hasBusPattern) return 'bus';
  if (!hasStation && !o.includes('wharf') && !d.includes('wharf')) return 'bus';

  // Default: train
  return 'train';
}

/**
 * Keep pinned routes first while preserving manual order elsewhere.
 */
function sortRouteCards(cards: RouteCard[]): RouteCard[] {
  return [...cards].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;

    if (a.pinned && b.pinned) {
      const aPinnedAt = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0;
      const bPinnedAt = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0;
      if (aPinnedAt !== bPinnedAt) return bPinnedAt - aPinnedAt;
    }

    return a.order - b.order;
  });
}

function normalizeRouteCard(card: RouteCard): RouteCard {
  return {
    ...card,
    pinned: card.pinned === true,
    pinnedAt: card.pinned ? card.pinnedAt ?? card.updatedAt ?? card.createdAt ?? null : null,
  };
}

/**
 * Migrate route cards — ensure data integrity on load.
 */
function migrateRouteCards(cards: RouteCard[]): RouteCard[] {
  return sortRouteCards(cards.map(normalizeRouteCard));
}

function toRouteCardSaveInput(card: RouteCard): Omit<RouteCard, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    title: card.title,
    origin: card.origin,
    originStopId: card.originStopId,
    destination: card.destination,
    destinationStopId: card.destinationStopId,
    mode: card.mode,
    routeFilter: card.routeFilter,
    order: card.order,
    enabled: card.enabled,
    pinned: card.pinned === true,
    pinnedAt: card.pinned === true ? card.pinnedAt ?? card.updatedAt ?? card.createdAt ?? null : null,
  };
}

function routeSignature(card: RouteCard): string {
  return [card.title, card.origin, card.destination]
    .map((value) => value.trim().toLowerCase())
    .join('::');
}

function isNewerRouteCard(local: RouteCard, remote: RouteCard): boolean {
  return new Date(local.updatedAt).getTime() > new Date(remote.updatedAt).getTime();
}

function remapLocalAlertScheduleRouteIds(localId: string, remoteId: string): void {
  const schedules = getLocalAlertSchedules();
  if (!schedules.some((schedule) => schedule.routeCardId === localId)) return;
  setLocalAlertSchedules(schedules.map((schedule) =>
    schedule.routeCardId === localId ? { ...schedule, routeCardId: remoteId } : schedule
  ));
}

async function syncLocalRouteCardsToFirestore(localCards: RouteCard[], remoteCards: RouteCard[]): Promise<RouteCard[]> {
  if (localCards.length === 0) return migrateRouteCards(remoteCards);

  const mergedById = new Map(remoteCards.map((card) => [card.id, normalizeRouteCard(card)]));
  const remoteSignatures = new Map(remoteCards.map((card) => [routeSignature(card), normalizeRouteCard(card)]));

  for (const localCard of localCards.map(normalizeRouteCard)) {
    const remoteById = mergedById.get(localCard.id);

    if (remoteById) {
      const pinnedChanged = localCard.pinned !== remoteById.pinned || (localCard.pinnedAt ?? null) !== (remoteById.pinnedAt ?? null);
      if (pinnedChanged || isNewerRouteCard(localCard, remoteById)) {
        const saved = await apiUpdateRouteCard(localCard.id, toRouteCardSaveInput(localCard));
        mergedById.set(saved.id, normalizeRouteCard(saved));
      }
      continue;
    }

    const remoteBySignature = remoteSignatures.get(routeSignature(localCard));
    if (remoteBySignature && localCard.id.startsWith('local-')) {
      remapPendingRouteReferences(localCard.id, remoteBySignature.id);
      remapLocalAlertScheduleRouteIds(localCard.id, remoteBySignature.id);
      mergedById.set(remoteBySignature.id, normalizeRouteCard({
        ...remoteBySignature,
        pinned: localCard.pinned,
        pinnedAt: localCard.pinnedAt,
      }));
      if (localCard.pinned !== remoteBySignature.pinned || (localCard.pinnedAt ?? null) !== (remoteBySignature.pinnedAt ?? null)) {
        const saved = await apiUpdateRouteCard(remoteBySignature.id, {
          pinned: localCard.pinned,
          pinnedAt: localCard.pinnedAt,
        });
        mergedById.set(saved.id, normalizeRouteCard(saved));
      }
      continue;
    }

    const saved = await createRouteCard(toRouteCardSaveInput(localCard));
    mergedById.set(saved.id, normalizeRouteCard(saved));
    remapPendingRouteReferences(localCard.id, saved.id);
    remapLocalAlertScheduleRouteIds(localCard.id, saved.id);
  }

  return migrateRouteCards([...mergedById.values()]);
}

export const useAppStore = create<AppState>()((set, get) => ({
  // ─── Route Cards (offline-first) ─────────────────────────────────

  routeCards: migrateRouteCards(getLocalRouteCards()),

  loadRouteCards: async () => {
    // Always load from localStorage first (instant)
    const local = migrateRouteCards(getLocalRouteCards());
    if (local.length > 0) {
      set({ routeCards: local });
      setLocalRouteCards(local);
    }

    // Then try to sync with Firestore. Local saved routes win when Firestore
    // is missing them, so existing device routes are uploaded instead of being
    // left local-only.
    try {
      const deletedRouteIds = pendingDeletedIds('delete_route');
      const remote = migrateRouteCards((await fetchRouteCards()).filter((card) => !deletedRouteIds.has(card.id)));
      const synced = await syncLocalRouteCardsToFirestore(local.filter((card) => !deletedRouteIds.has(card.id)), remote);
      set({ routeCards: synced });
      setLocalRouteCards(synced);
      setLastSyncTime();
    } catch {
      // Backend unavailable — local data is still displayed, no console noise
    }
  },

  saveRouteCard: async (card) => {
    const now = new Date().toISOString();
    const localCard: RouteCard = {
      ...card,
      id: generateLocalId(),
      createdAt: now,
      updatedAt: now,
    };

    // Save locally immediately
    set((state) => {
      const updated = [...state.routeCards, localCard];
      setLocalRouteCards(updated);
      return { routeCards: updated };
    });

    // Try backend
    try {
      const savedCard = await createRouteCard(card);
      // Replace local card with the server version (has real ID)
      set((state) => {
        const updated = state.routeCards.map((c) =>
          c.id === localCard.id ? savedCard : c
        );
        const updatedSchedules = state.alertSchedules.map((schedule) =>
          schedule.routeCardId === localCard.id ? { ...schedule, routeCardId: savedCard.id } : schedule
        );
        const nextLiveTrains = { ...state.liveTrains };
        const nextLiveTrainsLoading = { ...state.liveTrainsLoading };
        const nextLiveTrainsError = { ...state.liveTrainsError };
        const nextLiveTrainsUpdatedAt = { ...state.liveTrainsUpdatedAt };
        if (nextLiveTrains[localCard.id]) {
          nextLiveTrains[savedCard.id] = nextLiveTrains[localCard.id];
          delete nextLiveTrains[localCard.id];
        }
        if (localCard.id in nextLiveTrainsLoading) {
          nextLiveTrainsLoading[savedCard.id] = nextLiveTrainsLoading[localCard.id];
          delete nextLiveTrainsLoading[localCard.id];
        }
        if (localCard.id in nextLiveTrainsError) {
          nextLiveTrainsError[savedCard.id] = nextLiveTrainsError[localCard.id];
          delete nextLiveTrainsError[localCard.id];
        }
        if (localCard.id in nextLiveTrainsUpdatedAt) {
          nextLiveTrainsUpdatedAt[savedCard.id] = nextLiveTrainsUpdatedAt[localCard.id];
          delete nextLiveTrainsUpdatedAt[localCard.id];
        }
        setLocalRouteCards(updated);
        setLocalAlertSchedules(updatedSchedules);
        return {
          routeCards: updated,
          alertSchedules: updatedSchedules,
          liveTrains: nextLiveTrains,
          liveTrainsLoading: nextLiveTrainsLoading,
          liveTrainsError: nextLiveTrainsError,
          liveTrainsUpdatedAt: nextLiveTrainsUpdatedAt,
        };
      });
      remapPendingRouteReferences(localCard.id, savedCard.id);
    } catch {
      // Queue for later sync
      addPendingOp({ type: 'create_route', payload: { localId: localCard.id, card } });
    }
    void get().refreshAllData(true);
  },

  updateRouteCard: async (id, updates) => {
    // Update locally immediately
    set((state) => {
      const updated = state.routeCards.map((c) =>
        c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
      );
      setLocalRouteCards(updated);
      return { routeCards: updated };
    });

    if (id.startsWith('local-') && mergePendingLocalCreate('route', id, updates as Record<string, unknown>)) {
      void get().refreshAllData(true);
      return;
    }

    // Try backend
    try {
      await apiUpdateRouteCard(id, updates);
    } catch {
      addPendingOp({ type: 'update_route', payload: { id, updates } });
    }
    void get().refreshAllData(true);
  },

  reorderRouteCards: async (cardIds) => {
    // Optimistic local update
    set((state) => {
      const cardMap = new Map(state.routeCards.map((c) => [c.id, c]));
      const reordered = cardIds
        .map((id, index) => {
          const card = cardMap.get(id);
          if (!card) return null;
          return { ...card, order: index };
        })
        .filter((c): c is RouteCard => c !== null);
      setLocalRouteCards(reordered);
      return { routeCards: reordered };
    });

    // Try backend
    try {
      await updateRouteOrder(cardIds);
    } catch {
      addPendingOp({ type: 'reorder_routes', payload: { cardIds } });
    }
    void get().refreshAllData(true);
  },

  deleteRouteCard: async (id) => {
    // Remove locally immediately
    set((state) => {
      const updated = state.routeCards.filter((c) => c.id !== id);
      const updatedSchedules = state.alertSchedules.filter((s) => s.routeCardId !== id);
      setLocalRouteCards(updated);
      setLocalAlertSchedules(updatedSchedules);
      return { routeCards: updated, alertSchedules: updatedSchedules };
    });

    removePendingEntityOps('route', id);

    // Try backend (skip for local-only items that never synced)
    if (!id.startsWith('local-')) {
      addPendingOp({ type: 'delete_route', payload: { id } });
      try {
        await apiDeleteRouteCard(id);
        removePendingOps((op) => op.type === 'delete_route' && (op.payload as { id?: string }).id === id);
      } catch {
        // Keep pending delete tombstone so Firestore snapshots cannot resurrect it.
      }
    }
    void get().refreshAllData(true);
  },

  // ─── Live Trains ──────────────────────────────────────────────────

  liveTrains: getCachedLiveTrains(),
  liveTrainsLoading: {},
  liveTrainsError: {},
  liveTrainsUpdatedAt: getCachedLiveTrainUpdatedAt(),

  fetchLiveTrains: async (routeId, limit, force = false) => {
    const stateBeforeFetch = get();
    if (stateBeforeFetch.liveTrainsLoading[routeId]) return;

    const lastFetchedAt = lastLiveTrainFetchAt.get(routeId) || 0;
    if (!force && Date.now() - lastFetchedAt < LIVE_TRAIN_MIN_REFRESH_MS) return;
    lastLiveTrainFetchAt.set(routeId, Date.now());

    set((state) => ({
      liveTrainsLoading: { ...state.liveTrainsLoading, [routeId]: true },
      liveTrainsError: { ...state.liveTrainsError, [routeId]: null },
    }));

    try {
      const state = get();
      const card = state.routeCards.find((c) => c.id === routeId);
      const origin = card?.origin || '';
      const destination = card?.destination || '';

      // Look up stop IDs from preset data if not saved on the card
      let originStopId = card?.originStopId || '';
      let destinationStopId = card?.destinationStopId || '';

      if (!originStopId) {
        const preset = PRESET_STOPS.find((s) => s.name.toLowerCase() === origin.toLowerCase());
        if (preset) originStopId = preset.stopId;
      }
      if (!destinationStopId) {
        const preset = PRESET_STOPS.find((s) => s.name.toLowerCase() === destination.toLowerCase());
        if (preset) destinationStopId = preset.stopId;
      }

      const trains = await apiFetchLiveTrains(routeId, origin, destination, originStopId, destinationStopId, limit, card?.mode || inferModeFromStops(origin, destination));
      set((state) => {
        const fetchedAt = new Date().toISOString();
        const updatedLiveTrains = { ...state.liveTrains, [routeId]: trains };
        setCachedRouteLiveTrains(routeId, trains);
        return {
          liveTrains: updatedLiveTrains,
          liveTrainsUpdatedAt: { ...state.liveTrainsUpdatedAt, [routeId]: fetchedAt },
          liveTrainsLoading: { ...state.liveTrainsLoading, [routeId]: false },
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch live trains';
      set((state) => ({
        liveTrainsError: { ...state.liveTrainsError, [routeId]: message },
        liveTrainsLoading: { ...state.liveTrainsLoading, [routeId]: false },
      }));
    }
  },

  refreshAllData: async (force = false) => {
    if (refreshAllPromise) return refreshAllPromise;

    refreshAllPromise = (async () => {
      if (navigator.onLine === false) return;
      await get().syncPendingOps();

      if (!isFirebaseRealtimeConfigured) {
        await Promise.allSettled([get().loadRouteCards(), get().loadAlertSchedules()]);
      }

      const cards = get().routeCards.filter((card) => card.enabled !== false);
      for (const card of cards) {
        await get().fetchLiveTrains(card.id, undefined, force);
        if (cards.length > 1) await delay(LIVE_TRAIN_BATCH_DELAY_MS);
      }
    })().finally(() => {
      refreshAllPromise = null;
    });

    return refreshAllPromise;
  },

  startRealtimeSync: () => {
    if (realtimeUnsubscribe) return realtimeUnsubscribe;
    if (!clientFirestore || !isFirebaseRealtimeConfigured) {
      set({ realtimeEnabled: false });
      return () => undefined;
    }

    const routeCardsQuery = query(
      collection(clientFirestore, 'users', DEFAULT_USER_ID, 'routeCards'),
      orderBy('order')
    );
    const schedulesQuery = collection(clientFirestore, 'users', DEFAULT_USER_ID, 'alertSchedules');

    const unsubscribeRoutes: Unsubscribe = onSnapshot(routeCardsQuery, (snapshot) => {
      const deletedRouteIds = pendingDeletedIds('delete_route');
      const cards = migrateRouteCards(snapshot.docs.map(asRouteCard).filter((card) => !deletedRouteIds.has(card.id)));
      set({ routeCards: cards, realtimeEnabled: true });
      setLocalRouteCards(cards);
      setLastSyncTime();
      void get().refreshAllData(true);
    }, () => {
      set({ realtimeEnabled: false });
    });

    const unsubscribeSchedules: Unsubscribe = onSnapshot(schedulesQuery, (snapshot) => {
      const deletedScheduleIds = pendingDeletedIds('delete_schedule');
      const schedules = snapshot.docs.map(asAlertSchedule).filter((schedule) => !deletedScheduleIds.has(schedule.id));
      set({ alertSchedules: schedules, realtimeEnabled: true });
      setLocalAlertSchedules(schedules);
      setLastSyncTime();
    }, () => {
      set({ realtimeEnabled: false });
    });

    realtimeUnsubscribe = () => {
      unsubscribeRoutes();
      unsubscribeSchedules();
      realtimeUnsubscribe = null;
      set({ realtimeEnabled: false });
    };

    return realtimeUnsubscribe;
  },

  // ─── Alert Schedules (offline-first) ──────────────────────────────

  alertSchedules: getLocalAlertSchedules(),

  loadAlertSchedules: async () => {
    // Load from localStorage first
    const local = getLocalAlertSchedules();
    if (local.length > 0) {
      set({ alertSchedules: local });
    }

    // Try to sync from backend
    try {
      const deletedScheduleIds = pendingDeletedIds('delete_schedule');
      const remote = (await fetchSchedules()).filter((schedule) => !deletedScheduleIds.has(schedule.id));
      if (remote.length > 0 || local.length === 0) {
        set({ alertSchedules: remote });
        setLocalAlertSchedules(remote);
        setLastSyncTime();
      }
    } catch {
      // Backend unavailable — local data is still displayed
    }
  },

  saveAlertSchedule: async (schedule) => {
    const now = new Date().toISOString();
    const localSchedule: AlertSchedule = {
      ...schedule,
      id: generateLocalId(),
      createdAt: now,
      updatedAt: now,
    };

    // Save locally immediately
    set((state) => {
      const updated = [...state.alertSchedules, localSchedule];
      setLocalAlertSchedules(updated);
      return { alertSchedules: updated };
    });

    // Try backend
    try {
      const savedSchedule = await createSchedule(schedule);
      set((state) => {
        const updated = state.alertSchedules.map((s) =>
          s.id === localSchedule.id ? savedSchedule : s
        );
        setLocalAlertSchedules(updated);
        return { alertSchedules: updated };
      });
    } catch {
      addPendingOp({ type: 'create_schedule', payload: { localId: localSchedule.id, schedule } });
    }
    void get().refreshAllData(true);
  },


  updateAlertSchedule: async (id, updates) => {
    set((state) => {
      const updated = state.alertSchedules.map((s) =>
        s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
      );
      setLocalAlertSchedules(updated);
      return { alertSchedules: updated };
    });

    if (id.startsWith('local-') && mergePendingLocalCreate('schedule', id, updates as Record<string, unknown>)) {
      void get().refreshAllData(true);
      return;
    }

    try {
      const saved = await updateSchedule(id, updates);
      set((state) => {
        const updated = state.alertSchedules.map((s) => s.id === id ? saved : s);
        setLocalAlertSchedules(updated);
        return { alertSchedules: updated };
      });
    } catch {
      addPendingOp({ type: 'update_schedule', payload: { id, updates } });
    }
    void get().refreshAllData(true);
  },


  updateAlertSchedule: async (id, updates) => {
    set((state) => {
      const updated = state.alertSchedules.map((s) =>
        s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
      );
      setLocalAlertSchedules(updated);
      return { alertSchedules: updated };
    });

    try {
      const saved = await updateSchedule(id, updates);
      set((state) => {
        const updated = state.alertSchedules.map((s) => s.id === id ? saved : s);
        setLocalAlertSchedules(updated);
        return { alertSchedules: updated };
      });
    } catch {
      addPendingOp({ type: 'update_schedule', payload: { id, updates } });
    }
  },

  toggleAlertSchedule: async (id, enabled) => {
    // Update locally immediately
    set((state) => {
      const updated = state.alertSchedules.map((s) =>
        s.id === id ? { ...s, enabled, updatedAt: new Date().toISOString() } : s
      );
      setLocalAlertSchedules(updated);
      return { alertSchedules: updated };
    });

    if (id.startsWith('local-') && mergePendingLocalCreate('schedule', id, { enabled })) {
      void get().refreshAllData(true);
      return;
    }

    // Try backend
    try {
      await updateSchedule(id, { enabled });
    } catch {
      addPendingOp({ type: 'update_schedule', payload: { id, updates: { enabled } } });
    }
    void get().refreshAllData(true);
  },

  deleteAlertSchedule: async (id) => {
    // Remove locally immediately
    set((state) => {
      const updated = state.alertSchedules.filter((s) => s.id !== id);
      setLocalAlertSchedules(updated);
      return { alertSchedules: updated };
    });

    removePendingEntityOps('schedule', id);

    // Try backend
    if (!id.startsWith('local-')) {
      addPendingOp({ type: 'delete_schedule', payload: { id } });
      try {
        await apiDeleteSchedule(id);
        removePendingOps((op) => op.type === 'delete_schedule' && (op.payload as { id?: string }).id === id);
      } catch {
        // Keep pending delete tombstone so Firestore snapshots cannot resurrect it.
      }
    }
    void get().refreshAllData(true);
  },

  // ─── Navigation Context ───────────────────────────────────────────

  pendingAlertPrefill: null,
  setPendingAlertPrefill: (data) => {
    set({ pendingAlertPrefill: data });
  },

  // ─── Settings (offline-first) ─────────────────────────────────────

  settings: getLocalSettings(),

  updateSettings: async (newSettings) => {
    let nextSettings: AppSettings;
    set((state) => {
      const updated = { ...state.settings, ...newSettings };
      setLocalSettings(updated);
      nextSettings = updated;
      return { settings: updated };
    });
    try {
      const saved = await saveSettings(nextSettings!);
      set((state) => {
        const merged = { ...state.settings, ...saved };
        setLocalSettings(merged);
        return { settings: merged };
      });
    } catch {
      addPendingOp({ type: 'update_settings', payload: { settings: nextSettings! } });
    }
  },

  // ─── Sync Engine ──────────────────────────────────────────────────

  isSyncing: false,
  realtimeEnabled: false,

  syncPendingOps: async () => {
    if (get().isSyncing) return;
    const ops = getPendingOps();
    if (ops.length === 0) return;

    set({ isSyncing: true });

    for (const op of ops) {
      try {
        switch (op.type) {
          case 'create_route': {
            const { localId, card } = op.payload as { localId: string; card: Omit<RouteCard, 'id' | 'createdAt' | 'updatedAt'> };
            if (!get().routeCards.some((route) => route.id === localId)) {
              break;
            }
            const saved = await createRouteCard(card);
            // Replace local ID with server ID
            set((state) => {
              const updated = state.routeCards.map((c) =>
                c.id === localId ? saved : c
              );
              const updatedSchedules = state.alertSchedules.map((schedule) =>
                schedule.routeCardId === localId ? { ...schedule, routeCardId: saved.id } : schedule
              );
              const nextLiveTrains = { ...state.liveTrains };
              const nextLiveTrainsLoading = { ...state.liveTrainsLoading };
              const nextLiveTrainsError = { ...state.liveTrainsError };
              const nextLiveTrainsUpdatedAt = { ...state.liveTrainsUpdatedAt };
              if (nextLiveTrains[localId]) {
                nextLiveTrains[saved.id] = nextLiveTrains[localId];
                delete nextLiveTrains[localId];
              }
              if (localId in nextLiveTrainsLoading) {
                nextLiveTrainsLoading[saved.id] = nextLiveTrainsLoading[localId];
                delete nextLiveTrainsLoading[localId];
              }
              if (localId in nextLiveTrainsError) {
                nextLiveTrainsError[saved.id] = nextLiveTrainsError[localId];
                delete nextLiveTrainsError[localId];
              }
              if (localId in nextLiveTrainsUpdatedAt) {
                nextLiveTrainsUpdatedAt[saved.id] = nextLiveTrainsUpdatedAt[localId];
                delete nextLiveTrainsUpdatedAt[localId];
              }
              setLocalRouteCards(updated);
              setLocalAlertSchedules(updatedSchedules);
              return {
                routeCards: updated,
                alertSchedules: updatedSchedules,
                liveTrains: nextLiveTrains,
                liveTrainsLoading: nextLiveTrainsLoading,
                liveTrainsError: nextLiveTrainsError,
                liveTrainsUpdatedAt: nextLiveTrainsUpdatedAt,
              };
            });
            remapPendingRouteReferences(localId, saved.id);
            break;
          }
          case 'update_route': {
            const { id, updates } = op.payload as { id: string; updates: Partial<RouteCard> };
            await apiUpdateRouteCard(id, updates);
            break;
          }
          case 'delete_route': {
            const { id } = op.payload as { id: string };
            await apiDeleteRouteCard(id);
            break;
          }
          case 'reorder_routes': {
            const { cardIds } = op.payload as { cardIds: string[] };
            await updateRouteOrder(cardIds);
            break;
          }
          case 'create_schedule': {
            const { schedule } = op.payload as { localId: string; schedule: Omit<AlertSchedule, 'id' | 'createdAt' | 'updatedAt'> };
            const saved = await createSchedule(schedule);
            const { localId } = op.payload as { localId: string };
            set((state) => {
              const updated = state.alertSchedules.map((s) =>
                s.id === localId ? saved : s
              );
              setLocalAlertSchedules(updated);
              return { alertSchedules: updated };
            });
            break;
          }
          case 'update_schedule': {
            const { id, updates } = op.payload as { id: string; updates: Partial<AlertSchedule> };
            await updateSchedule(id, updates);
            break;
          }
          case 'delete_schedule': {
            const { id } = op.payload as { id: string };
            await apiDeleteSchedule(id);
            break;
          }
          case 'update_settings': {
            const { settings } = op.payload as { settings: AppSettings };
            const saved = await saveSettings(settings);
            set((state) => {
              const merged = { ...state.settings, ...saved };
              setLocalSettings(merged);
              return { settings: merged };
            });
            break;
          }
        }
        // Operation succeeded — remove from queue
        removePendingOp(op.id);
      } catch {
        // Still failing — leave in queue for next sync attempt
        updatePendingOp(op.id, { retries: op.retries + 1 });
      }
    }

    set({ isSyncing: false });
    setLastSyncTime();
  },
}));

  // ─── Auto-sync on app load and when coming back online ──────────────

if (typeof window !== 'undefined') {
  // Sync pending ops once on app load
  setTimeout(() => {
    useAppStore.getState().syncPendingOps().catch(() => undefined);
  }, 5000);

  // Sync when coming back online
  window.addEventListener('online', () => {
    useAppStore.getState().syncPendingOps().catch(() => undefined);
  });
}
