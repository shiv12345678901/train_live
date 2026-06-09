import { create } from 'zustand';
import type { RouteCard, TrainDeparture, AlertSchedule, AlertPrefillData, AppSettings } from '@/types';
import { fetchRouteCards, createRouteCard, deleteRouteCard as apiDeleteRouteCard, updateRouteOrder, updateRouteCard as apiUpdateRouteCard } from '@/api/routeApi';
import { fetchLiveTrains as apiFetchLiveTrains } from '@/api/trainApi';
import { fetchSchedules, createSchedule, updateSchedule, deleteSchedule as apiDeleteSchedule } from '@/api/scheduleApi';
import { saveSettings } from '@/api/settingsApi';
import {
  getLocalRouteCards, setLocalRouteCards,
  getLocalAlertSchedules, setLocalAlertSchedules,
  getLocalSettings, setLocalSettings,
  addPendingOp, getPendingOps, removePendingOp, updatePendingOp,
  setLastSyncTime,
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
  fetchLiveTrains: (routeId: string) => Promise<void>;

  // Alert Schedules
  alertSchedules: AlertSchedule[];
  loadAlertSchedules: () => Promise<void>;
  saveAlertSchedule: (schedule: Omit<AlertSchedule, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
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
  syncPendingOps: () => Promise<void>;
}

/**
 * Generate a local ID for offline-created items.
 */
function generateLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useAppStore = create<AppState>()((set, get) => ({
  // ─── Route Cards (offline-first) ─────────────────────────────────

  routeCards: getLocalRouteCards(),

  loadRouteCards: async () => {
    // Always load from localStorage first (instant)
    const local = getLocalRouteCards();
    if (local.length > 0) {
      set({ routeCards: local });
    }

    // Then try to sync from backend (silently, don't spam console)
    try {
      const remote = await fetchRouteCards();
      if (remote.length > 0 || local.length === 0) {
        set({ routeCards: remote });
        setLocalRouteCards(remote);
        setLastSyncTime();
      }
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
        setLocalRouteCards(updated);
        return { routeCards: updated };
      });
    } catch {
      // Queue for later sync
      addPendingOp({ type: 'create_route', payload: { localId: localCard.id, card } });
    }
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

    // Try backend
    try {
      await apiUpdateRouteCard(id, updates);
    } catch {
      addPendingOp({ type: 'update_route', payload: { id, updates } });
    }
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

    // Try backend (skip for local-only items that never synced)
    if (!id.startsWith('local-')) {
      try {
        await apiDeleteRouteCard(id);
      } catch {
        addPendingOp({ type: 'delete_route', payload: { id } });
      }
    }
  },

  // ─── Live Trains ──────────────────────────────────────────────────

  liveTrains: {},
  liveTrainsLoading: {},
  liveTrainsError: {},

  fetchLiveTrains: async (routeId) => {
    set((state) => ({
      liveTrainsLoading: { ...state.liveTrainsLoading, [routeId]: true },
      liveTrainsError: { ...state.liveTrainsError, [routeId]: null },
    }));

    try {
      // For local-only routes, pass origin/destination directly
      const state = get();
      const card = state.routeCards.find((c) => c.id === routeId);
      const origin = card?.origin;
      const destination = card?.destination;
      const originStopId = card?.originStopId;
      const destinationStopId = card?.destinationStopId;

      const trains = await apiFetchLiveTrains(routeId, origin, destination, originStopId, destinationStopId);
      set((state) => ({
        liveTrains: { ...state.liveTrains, [routeId]: trains },
        liveTrainsLoading: { ...state.liveTrainsLoading, [routeId]: false },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch live trains';
      set((state) => ({
        liveTrainsError: { ...state.liveTrainsError, [routeId]: message },
        liveTrainsLoading: { ...state.liveTrainsLoading, [routeId]: false },
      }));
    }
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
      const remote = await fetchSchedules();
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

    // Try backend
    try {
      await updateSchedule(id, { enabled });
    } catch {
      addPendingOp({ type: 'update_schedule', payload: { id, updates: { enabled } } });
    }
  },

  deleteAlertSchedule: async (id) => {
    // Remove locally immediately
    set((state) => {
      const updated = state.alertSchedules.filter((s) => s.id !== id);
      setLocalAlertSchedules(updated);
      return { alertSchedules: updated };
    });

    // Try backend
    if (!id.startsWith('local-')) {
      try {
        await apiDeleteSchedule(id);
      } catch {
        addPendingOp({ type: 'delete_schedule', payload: { id } });
      }
    }
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

  syncPendingOps: async () => {
    const ops = getPendingOps();
    if (ops.length === 0) return;

    set({ isSyncing: true });

    for (const op of ops) {
      try {
        switch (op.type) {
          case 'create_route': {
            const { card } = op.payload as { localId: string; card: Omit<RouteCard, 'id' | 'createdAt' | 'updatedAt'> };
            const saved = await createRouteCard(card);
            const { localId } = op.payload as { localId: string };
            // Replace local ID with server ID
            set((state) => {
              const updated = state.routeCards.map((c) =>
                c.id === localId ? saved : c
              );
              setLocalRouteCards(updated);
              return { routeCards: updated };
            });
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
