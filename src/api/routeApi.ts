import type { RouteCard } from '@/types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/.netlify/functions';
const DEFAULT_USER_ID = 'default-user';

/**
 * Fetch all route cards for the current user, ordered by the `order` field.
 */
export async function fetchRouteCards(): Promise<RouteCard[]> {
  const res = await fetch(`${API_BASE}/routes-list`, {
    headers: { 'x-user-id': DEFAULT_USER_ID },
  });
  if (!res.ok) return [];
  return res.json();
}

/**
 * Create a new route card document.
 * Returns the saved card with a generated ID and timestamps.
 */
export async function createRouteCard(
  card: Omit<RouteCard, 'id' | 'createdAt' | 'updatedAt'>
): Promise<RouteCard> {
  const res = await fetch(`${API_BASE}/routes-create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': DEFAULT_USER_ID,
    },
    body: JSON.stringify(card),
  });
  if (!res.ok) {
    throw new Error('Failed to create route card');
  }
  return res.json();
}

/**
 * Update an existing route card document.
 */
export async function updateRouteCard(
  id: string,
  card: Partial<RouteCard>
): Promise<RouteCard> {
  const res = await fetch(`${API_BASE}/routes-update?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': DEFAULT_USER_ID,
    },
    body: JSON.stringify(card),
  });
  if (!res.ok) {
    throw new Error('Failed to update route card');
  }
  return res.json();
}

/**
 * Delete a route card document.
 */
export async function deleteRouteCard(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/routes-delete?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'x-user-id': DEFAULT_USER_ID },
  });
  if (!res.ok) {
    throw new Error('Failed to delete route card');
  }
}

/**
 * Batch-update the order field for all route cards given an ordered array of IDs.
 */
export async function updateRouteOrder(cardIds: string[]): Promise<void> {
  const res = await fetch(`${API_BASE}/routes-order`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': DEFAULT_USER_ID,
    },
    body: JSON.stringify({ orderedIds: cardIds }),
  });
  if (!res.ok) {
    throw new Error('Failed to update route order');
  }
}
