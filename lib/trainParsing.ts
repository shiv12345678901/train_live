export type TransportType = 'train' | 'metro' | 'bus' | 'light_rail' | 'ferry';
export type TrainStatus = 'on-time' | 'delayed' | 'cancelled' | 'changed' | 'unknown';

export function detectTransportType(productClass: number, productName: string, line: string): TransportType {
  const name = productName.toLowerCase();
  const route = line.toLowerCase();

  // Metro: class 2 or line starts with M + digit
  if (productClass === 2 || name.includes('metro') || /^m\d/.test(route)) return 'metro';
  // Light Rail: class 4 or line starts with L + digit
  if (productClass === 4 || name.includes('light rail') || /^l\d/.test(route)) return 'light_rail';
  // Ferry: class 9 or line starts with F + digit
  if (productClass === 9 || name.includes('ferry') || /^f\d/.test(route)) return 'ferry';
  // Train: explicitly named or line starts with T + digit
  if (productClass === 1 || name.includes('train') || name.includes('intercity') || /^t\d/.test(route)) return 'train';
  // Bus: class 5/7 or numeric-only route
  if (productClass === 5 || productClass === 7 || name.includes('bus') || /^\d+$/.test(route) || route.startsWith('bus')) return 'bus';

  // Default to train for Sydney rail network
  return 'train';
}

export function getTimingStatus(
  scheduledTime: string,
  estimatedTime: string | undefined,
  isCancelled: boolean
): { status: TrainStatus; delayMinutes?: number } {
  if (isCancelled) return { status: 'cancelled' };
  if (!scheduledTime) return { status: 'unknown' };
  if (!estimatedTime) return { status: 'on-time' };

  const diff = (new Date(estimatedTime).getTime() - new Date(scheduledTime).getTime()) / 60000;
  if (!Number.isFinite(diff)) return { status: 'unknown' };
  if (diff <= 1) return { status: 'on-time' };

  return { status: 'delayed', delayMinutes: Math.round(diff) };
}

export function normalizeStopName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s*(station|wharf|light rail|stop)\s*/gi, '')
    .replace(/,.*$/, '')
    .trim();
}

/**
 * Kept for backward compatibility with alert-scheduler.
 * The main routes-trains function now uses its own more robust matching.
 */
export function matchesDestination(serviceDestination: string, targetDestination: string): boolean {
  const service = normalizeStopName(serviceDestination);
  const target = normalizeStopName(targetDestination);
  if (!service || !target) return false;

  if (service.includes(target) || target.includes(service)) return true;
  if (service.includes('via') && service.includes(target)) return true;

  const cityStations = ['central', 'town hall', 'wynyard', 'circular quay', 'martin place', 'st james', 'museum'];
  const isTargetCity = cityStations.some((s) => target.includes(s));
  const isServiceCity = cityStations.some((s) => service.includes(s));
  if (isTargetCity && isServiceCity) return true;

  return false;
}
