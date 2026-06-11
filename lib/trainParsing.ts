export type TransportType = 'train' | 'metro' | 'bus' | 'light_rail' | 'ferry';
export type TrainStatus = 'on-time' | 'delayed' | 'cancelled' | 'changed' | 'unknown';

export function detectTransportType(productClass: number, productName: string, line: string): TransportType {
  const name = productName.toLowerCase();
  const route = line.toLowerCase();

  if (productClass === 2 || name.includes('metro') || /^m\d/.test(route)) {
    return 'metro';
  }
  if (productClass === 4 || name.includes('light rail') || /^l\d/.test(route)) {
    return 'light_rail';
  }
  if (productClass === 9 || name.includes('ferry') || /^f\d/.test(route)) {
    return 'ferry';
  }
  if (name.includes('train') || name.includes('intercity') || /^t\d/.test(route)) {
    return 'train';
  }
  if (productClass === 5 || productClass === 7 || name.includes('bus') || /^\d+$/.test(route) || route.startsWith('bus')) {
    return 'bus';
  }
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
  return value.toLowerCase().replace(/\s*station\s*/gi, '').trim();
}

export function matchesDestination(serviceDestination: string, targetDestination: string): boolean {
  const service = normalizeStopName(serviceDestination);
  const target = normalizeStopName(targetDestination);
  if (!service || !target) return false;

  // Direct substring match
  if (service.includes(target) || target.includes(service)) return true;

  // "via" match — service destination includes target in a "via" clause
  if (service.includes('via') && service.includes(target)) return true;

  // City loop match — if target is a city station, services going TO any city loop station will pass through it
  const cityStations = ['central', 'town hall', 'wynyard', 'circular quay', 'martin place', 'st james', 'museum'];
  const isTargetCity = cityStations.some((station) => target.includes(station));
  const isServiceCity = cityStations.some((station) => service.includes(station));

  // Only match if the target itself is a city station AND the service is also going to a city station
  // (trains running through the city loop will stop at all city stations)
  if (isTargetCity && isServiceCity) return true;

  return false;
}
