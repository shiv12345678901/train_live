import type { TransportType } from './trainParsing';

/**
 * Shared platform extraction logic. Used by routes-trains and trip-stops.
 * Extracts clean platform number from TfNSW API location/origin objects.
 */
export function extractPlatform(locationOrOrigin: Record<string, unknown>, transportType?: TransportType): string {
  const isBusOrFerry = transportType === 'bus' || transportType === 'ferry';
  const props = (locationOrOrigin.properties || {}) as Record<string, string>;

  // Method 1: plannedPlatformName or platformName (cleanest)
  const platformName = props.plannedPlatformName || props.platformName || '';
  if (platformName) {
    const match = platformName.match(/(\d+|[A-Z])$/i);
    return match ? match[1] : platformName;
  }

  // Method 2: stoppingPointPlanned
  const stoppingPoint = props.stoppingPointPlanned || '';
  if (stoppingPoint) {
    const match = stoppingPoint.match(/(\d+|[A-Z])$/i);
    return match ? match[1] : '';
  }

  // Method 3: disassembledName patterns
  const disassembled = (locationOrOrigin.disassembledName as string) || '';
  const platMatch = disassembled.match(/[Pp]latform\s*(\d+|[A-Z])/);
  if (platMatch) return platMatch[1];
  const standMatch = disassembled.match(/[Ss]tand\s+([A-Z0-9])/);
  if (standMatch) return standMatch[1];

  // Method 4: For buses, don't extract random trailing numbers
  if (isBusOrFerry) return '';

  // Method 5: area field
  const area = props.area || '';
  if (area && /^\d+$/.test(area) && Number(area) > 0 && Number(area) <= 30) {
    return area;
  }

  return '';
}
