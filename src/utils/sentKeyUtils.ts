/**
 * Utility functions for generating and checking sent keys.
 * Sent keys are idempotency keys that prevent duplicate alert messages.
 */

/**
 * Generate a sent key for a fixed reminder.
 * Format: {alertId}:{departureIso}:fixed-{offset}
 */
export function generateFixedReminderKey(
  alertId: string,
  departureIso: string,
  offset: number
): string {
  return `${alertId}:${departureIso}:fixed-${offset}`;
}

/**
 * Generate a sent key for a change check alert.
 * Format: {alertId}:{departureIso}:change-{offset}:{changeHash}
 */
export function generateChangeCheckKey(
  alertId: string,
  departureIso: string,
  offset: number,
  changeHash: string
): string {
  return `${alertId}:${departureIso}:change-${offset}:${changeHash}`;
}

/**
 * Check if a sent key already exists in the list of sent keys.
 */
export function hasBeenSent(sentKeys: string[], key: string): boolean {
  return sentKeys.includes(key);
}
