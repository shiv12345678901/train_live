import type { AlertSchedule } from '@/types';
import { requestJson, requestVoid } from './client';

/**
 * Fetch all alert schedules for the current user.
 */
export async function fetchSchedules(): Promise<AlertSchedule[]> {
  return requestJson<AlertSchedule[]>('/schedules-list');
}

/**
 * Create a new alert schedule.
 * Returns the saved schedule with a generated ID and timestamps.
 */
export async function createSchedule(
  schedule: Omit<AlertSchedule, 'id' | 'createdAt' | 'updatedAt'>
): Promise<AlertSchedule> {
  return requestJson<AlertSchedule>('/schedules-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(schedule),
  });
}

/**
 * Update an existing alert schedule.
 */
export async function updateSchedule(
  id: string,
  data: Partial<AlertSchedule>
): Promise<AlertSchedule> {
  return requestJson<AlertSchedule>(`/schedules-update?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/**
 * Delete an alert schedule.
 */
export async function deleteSchedule(id: string): Promise<void> {
  await requestVoid(`/schedules-delete?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/**
 * Send a test alert for an existing schedule.
 * Uses the schedule's configuration to send a test message via Telegram.
 */
export async function testAlert(scheduleId: string): Promise<{ success: boolean; message?: string }> {
  return requestJson<{ success: boolean; message?: string }>('/schedules-test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduleId }),
  });
}
