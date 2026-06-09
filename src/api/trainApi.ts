import type { TrainDeparture } from '@/types';
import { requestJson } from './client';

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

  return requestJson<TrainDeparture[]>(`/routes-trains?${params.toString()}`);
}
