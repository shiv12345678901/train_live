import type { RouteCard } from '@/types';
import { requestJson, requestVoid } from './client';

/**
 * Fetch all route cards for the current user, ordered by the `order` field.
 */
export async function fetchRouteCards(): Promise<RouteCard[]> {
  return requestJson<RouteCard[]>('/routes-list');
}

/**
 * Create a new route card document.
 * Returns the saved card with a generated ID and timestamps.
 */
export async function createRouteCard(
  card: Omit<RouteCard, 'id' | 'createdAt' | 'updatedAt'>
): Promise<RouteCard> {
  return requestJson<RouteCard>('/routes-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card),
  });
}

/**
 * Update an existing route card document.
 */
export async function updateRouteCard(
  id: string,
  card: Partial<RouteCard>
): Promise<RouteCard> {
  return requestJson<RouteCard>(`/routes-update?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card),
  });
}

/**
 * Delete a route card document.
 */
export async function deleteRouteCard(id: string): Promise<void> {
  await requestVoid(`/routes-delete?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/**
 * Batch-update the order field for all route cards given an ordered array of IDs.
 */
export async function updateRouteOrder(cardIds: string[]): Promise<void> {
  await requestVoid('/routes-order', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds: cardIds }),
  });
}
