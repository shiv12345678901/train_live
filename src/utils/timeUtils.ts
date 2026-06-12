/**
 * Time calculation utilities for the alert scheduler and UI display.
 */

/**
 * Parse a time string in HH:mm format into hours and minutes.
 */
export function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hoursStr, minutesStr] = timeStr.split(':');
  return {
    hours: parseInt(hoursStr, 10),
    minutes: parseInt(minutesStr, 10),
  };
}

/**
 * Calculate the number of minutes until a departure time from now.
 * Returns a positive value if the departure is in the future,
 * negative if it has already passed.
 */
export function minutesUntilDeparture(departureTime: Date, now?: Date): number {
  const current = now || new Date();
  return (departureTime.getTime() - current.getTime()) / 60000;
}

/**
 * Check if the current minutes-until-departure falls within the timing window
 * for a target offset. Uses a ±0.5 minute window to account for scheduler variance.
 */
export function isWithinWindow(
  minutesUntil: number,
  target: number
): boolean {
  return minutesUntil >= target - 0.5 && minutesUntil < target + 0.5;
}

/**
 * Format a number of minutes into a human-readable relative time string.
 * Examples: "5 min", "20 min", "1 hr 5 min"
 */
export function formatRelativeTime(minutes: number): string {
  const absMinutes = Math.abs(Math.round(minutes));
  if (absMinutes < 60) {
    return `${absMinutes} min`;
  }
  const hours = Math.floor(absMinutes / 60);
  const remainingMinutes = absMinutes % 60;
  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${remainingMinutes} min`;
}

/**
 * Format an ISO datetime string into a display-friendly departure time.
 * Returns time in HH:mm format.
 */
export function formatDepartureDisplay(isoTime: string): string {
  return formatTransportTime24(isoTime) || '--:--';
}


export const TRANSPORT_TIME_ZONE = 'Australia/Sydney';

const TRANSPORT_TIME_FORMATTER = new Intl.DateTimeFormat('en-AU', {
  timeZone: TRANSPORT_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const TRANSPORT_TIME_24_FORMATTER = new Intl.DateTimeFormat('en-AU', {
  timeZone: TRANSPORT_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  hourCycle: 'h23',
});

/**
 * Format TfNSW times in Sydney time regardless of the viewer/server timezone.
 */
export function formatTransportTime(isoTime: string, fallback = 'Live time unavailable'): string {
  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) return fallback;
  return TRANSPORT_TIME_FORMATTER.format(date);
}

/**
 * Format TfNSW times as HH:mm in Sydney time for schedule form values.
 */
export function formatTransportTime24(isoTime: string): string {
  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) return '';
  return TRANSPORT_TIME_24_FORMATTER.format(date);
}
