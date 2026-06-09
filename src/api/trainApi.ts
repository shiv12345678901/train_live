import type { TrainDeparture } from '@/types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/.netlify/functions';
const DEFAULT_USER_ID = 'default-user';

/**
 * Fetch live train departures for a given route card.
 * Passes origin/destination as query params so the function works
 * even when the route only exists in localStorage (not yet in Firestore).
 */
export async function fetchLiveTrains(
  routeId: string,
  origin?: string,
  destination?: string,
  originStopId?: string,
  destinationStopId?: string
): Promise<TrainDeparture[]> {
  const params = new URLSearchParams({ id: routeId });
  if (origin) params.set('origin', origin);
  if (destination) params.set('destination', destination);
  if (originStopId) params.set('originStopId', originStopId);
  if (destinationStopId) params.set('destinationStopId', destinationStopId);

  const url = `${API_BASE}/routes-trains?${params.toString()}`;
  
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'x-user-id': DEFAULT_USER_ID },
    });
  } catch (e) {
    throw new Error('Network error — check your connection');
  }

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.error || body.detail || '';
    } catch {
      detail = `HTTP ${res.status}`;
    }
    throw new Error(detail || `Failed to fetch (${res.status})`);
  }

  return res.json();
}
