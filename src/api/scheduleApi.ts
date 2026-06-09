import type { AlertSchedule } from '@/types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/.netlify/functions';
const DEFAULT_USER_ID = 'default-user';

/**
 * Fetch all alert schedules for the current user.
 */
export async function fetchSchedules(): Promise<AlertSchedule[]> {
  const res = await fetch(`${API_BASE}/schedules-list`, {
    headers: { 'x-user-id': DEFAULT_USER_ID },
  });
  if (!res.ok) return [];
  return res.json();
}

/**
 * Create a new alert schedule.
 * Returns the saved schedule with a generated ID and timestamps.
 */
export async function createSchedule(
  schedule: Omit<AlertSchedule, 'id' | 'createdAt' | 'updatedAt'>
): Promise<AlertSchedule> {
  const res = await fetch(`${API_BASE}/schedules-create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': DEFAULT_USER_ID,
    },
    body: JSON.stringify(schedule),
  });
  if (!res.ok) {
    throw new Error('Failed to create schedule');
  }
  return res.json();
}

/**
 * Update an existing alert schedule.
 */
export async function updateSchedule(
  id: string,
  data: Partial<AlertSchedule>
): Promise<AlertSchedule> {
  const res = await fetch(`${API_BASE}/schedules-update?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': DEFAULT_USER_ID,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error('Failed to update schedule');
  }
  return res.json();
}

/**
 * Delete an alert schedule.
 */
export async function deleteSchedule(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/schedules-delete?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'x-user-id': DEFAULT_USER_ID },
  });
  if (!res.ok) {
    throw new Error('Failed to delete schedule');
  }
}

/**
 * Send a test alert for an existing schedule.
 * Uses the schedule's configuration to send a test message via Telegram.
 */
export async function testAlert(scheduleId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/schedules-test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': DEFAULT_USER_ID,
    },
    body: JSON.stringify({ scheduleId }),
  });
  if (!res.ok) {
    throw new Error('Failed to send test alert');
  }
}
