/**
 * LocalStorage persistence layer.
 * All app data is stored here as the primary source of truth.
 * Backend sync happens in the background — if it fails, data persists locally
 * and pending operations are queued for retry.
 */

const KEYS = {
  routeCards: 'trainlive:routeCards',
  alertSchedules: 'trainlive:alertSchedules',
  settings: 'trainlive:settings',
  pendingOps: 'trainlive:pendingOps',
  lastSync: 'trainlive:lastSync',
  liveTrainsCache: 'trainlive:liveTrainsCache',
  liveTrainsCacheTime: 'trainlive:liveTrainsCacheTime',
} as const;

// ─── Generic read/write ─────────────────────────────────────────────

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — silently fail
  }
}

// ─── Route Cards ────────────────────────────────────────────────────

import type { RouteCard, AlertSchedule, AppSettings } from '@/types';

export function getLocalRouteCards(): RouteCard[] {
  return read<RouteCard[]>(KEYS.routeCards, []);
}

export function setLocalRouteCards(cards: RouteCard[]): void {
  write(KEYS.routeCards, cards);
}

// ─── Alert Schedules ────────────────────────────────────────────────

export function getLocalAlertSchedules(): AlertSchedule[] {
  return read<AlertSchedule[]>(KEYS.alertSchedules, []);
}

export function setLocalAlertSchedules(schedules: AlertSchedule[]): void {
  write(KEYS.alertSchedules, schedules);
}

// ─── Settings ───────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  telegramConnected: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  theme: 'light',
};

export function getLocalSettings(): AppSettings {
  return read<AppSettings>(KEYS.settings, DEFAULT_SETTINGS);
}

export function setLocalSettings(settings: AppSettings): void {
  write(KEYS.settings, settings);
}

// ─── Pending Operations Queue ───────────────────────────────────────

export interface PendingOp {
  id: string;
  type: 'create_route' | 'update_route' | 'delete_route' | 'reorder_routes'
    | 'create_schedule' | 'update_schedule' | 'delete_schedule' | 'update_settings';
  payload: unknown;
  createdAt: string;
  retries: number;
}

export function getPendingOps(): PendingOp[] {
  return read<PendingOp[]>(KEYS.pendingOps, []);
}

export function addPendingOp(op: Omit<PendingOp, 'id' | 'createdAt' | 'retries'>): void {
  const ops = getPendingOps();
  ops.push({
    ...op,
    id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    retries: 0,
  });
  write(KEYS.pendingOps, ops);
}

export function removePendingOp(opId: string): void {
  const ops = getPendingOps().filter((op) => op.id !== opId);
  write(KEYS.pendingOps, ops);
}

export function updatePendingOp(opId: string, updates: Partial<PendingOp>): void {
  const ops = getPendingOps().map((op) =>
    op.id === opId ? { ...op, ...updates } : op
  );
  write(KEYS.pendingOps, ops);
}

export function clearPendingOps(): void {
  write(KEYS.pendingOps, []);
}

// ─── Sync Metadata ──────────────────────────────────────────────────

export function getLastSyncTime(): string | null {
  return localStorage.getItem(KEYS.lastSync);
}

export function setLastSyncTime(): void {
  localStorage.setItem(KEYS.lastSync, new Date().toISOString());
}

// ─── Live Trains Cache (Feature 33: Offline mode) ───────────────────

import type { TrainDeparture } from '@/types';

export function getCachedLiveTrains(): Record<string, TrainDeparture[]> {
  return read<Record<string, TrainDeparture[]>>(KEYS.liveTrainsCache, {});
}

export function setCachedLiveTrains(data: Record<string, TrainDeparture[]>): void {
  write(KEYS.liveTrainsCache, data);
  localStorage.setItem(KEYS.liveTrainsCacheTime, new Date().toISOString());
}

export function getLiveTrainsCacheAge(): string {
  const timeStr = localStorage.getItem(KEYS.liveTrainsCacheTime);
  if (!timeStr) return '';
  const cacheTime = new Date(timeStr).getTime();
  const ageMinutes = Math.round((Date.now() - cacheTime) / 60000);
  if (ageMinutes < 1) return 'Just now';
  if (ageMinutes === 1) return '1 min ago';
  if (ageMinutes < 60) return `${ageMinutes} min ago`;
  return `${Math.round(ageMinutes / 60)}h ago`;
}
