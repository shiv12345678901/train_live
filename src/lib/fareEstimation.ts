import type { FareEstimate } from '@/types';

/**
 * Sydney Opal fare estimation based on distance bands.
 * These are approximate adult fares as of 2024-2025.
 * Real fares vary by actual distance traveled; this provides an estimate.
 * 
 * Distance bands (km): 0-10, 10-20, 20-35, 35-65, 65+
 * Source: Transport for NSW fare structure (paraphrased)
 */

interface FareBand {
  maxKm: number;
  adultPeak: number;
  adultOffPeak: number;
}

const TRAIN_FARE_BANDS: FareBand[] = [
  { maxKm: 10, adultPeak: 3.79, adultOffPeak: 2.65 },
  { maxKm: 20, adultPeak: 4.74, adultOffPeak: 3.32 },
  { maxKm: 35, adultPeak: 5.50, adultOffPeak: 3.85 },
  { maxKm: 65, adultPeak: 7.01, adultOffPeak: 4.91 },
  { maxKm: Infinity, adultPeak: 8.86, adultOffPeak: 6.20 },
];

const BUS_FARE_BANDS: FareBand[] = [
  { maxKm: 3, adultPeak: 2.24, adultOffPeak: 1.57 },
  { maxKm: 8, adultPeak: 3.73, adultOffPeak: 2.61 },
  { maxKm: Infinity, adultPeak: 4.80, adultOffPeak: 3.36 },
];

const FERRY_FARE_BANDS: FareBand[] = [
  { maxKm: 9, adultPeak: 6.43, adultOffPeak: 4.50 },
  { maxKm: Infinity, adultPeak: 8.04, adultOffPeak: 5.63 },
];

const LIGHT_RAIL_FARE_BANDS: FareBand[] = [
  { maxKm: 3, adultPeak: 2.24, adultOffPeak: 1.57 },
  { maxKm: 8, adultPeak: 3.73, adultOffPeak: 2.61 },
  { maxKm: Infinity, adultPeak: 4.80, adultOffPeak: 3.36 },
];

const METRO_FARE_BANDS: FareBand[] = TRAIN_FARE_BANDS; // Same as train

/**
 * Rough straight-line distances between major Sydney stops (km).
 * Used for fare estimation when actual distance is unavailable.
 */
const KNOWN_DISTANCES: Record<string, number> = {
  'central:redfern': 2,
  'central:town hall': 1,
  'central:wynyard': 2,
  'central:circular quay': 3,
  'central:bondi junction': 6,
  'central:strathfield': 10,
  'central:parramatta': 22,
  'central:rockdale': 11,
  'central:hurstville': 15,
  'central:hornsby': 24,
  'central:chatswood': 12,
  'central:blacktown': 32,
  'central:penrith': 50,
  'central:campbelltown': 48,
  'central:cronulla': 28,
  'central:epping': 16,
  'redfern:rockdale': 9,
  'redfern:hurstville': 13,
  'redfern:town hall': 2,
  'rockdale:town hall': 12,
  'rockdale:hurstville': 5,
  'rockdale:kogarah': 2,
  'rockdale:wolli creek': 3,
  'strathfield:parramatta': 12,
  'chatswood:hornsby': 14,
  'north sydney:wynyard': 3,
  'bondi junction:circular quay': 6,
};

function normalizeForLookup(name: string): string {
  return name.toLowerCase()
    .replace(/\s*(station|wharf|light rail|,.*$)/gi, '')
    .trim();
}

function lookupDistance(origin: string, destination: string): number {
  const a = normalizeForLookup(origin);
  const b = normalizeForLookup(destination);
  
  const key1 = `${a}:${b}`;
  const key2 = `${b}:${a}`;
  
  if (KNOWN_DISTANCES[key1]) return KNOWN_DISTANCES[key1];
  if (KNOWN_DISTANCES[key2]) return KNOWN_DISTANCES[key2];
  
  // Default estimate based on typical Sydney commute (~15km)
  return 15;
}

function isPeakTime(): boolean {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const time = hour * 60 + minute;
  
  // Weekends are always off-peak
  if (day === 0 || day === 6) return false;
  
  // Peak: 6:30-10am and 3-7pm on weekdays
  const morningStart = 6 * 60 + 30;
  const morningEnd = 10 * 60;
  const afternoonStart = 15 * 60;
  const afternoonEnd = 19 * 60;
  
  return (time >= morningStart && time < morningEnd) ||
         (time >= afternoonStart && time < afternoonEnd);
}

function getFareBands(mode: string): FareBand[] {
  switch (mode) {
    case 'bus': return BUS_FARE_BANDS;
    case 'ferry': return FERRY_FARE_BANDS;
    case 'light_rail': return LIGHT_RAIL_FARE_BANDS;
    case 'metro': return METRO_FARE_BANDS;
    default: return TRAIN_FARE_BANDS;
  }
}

/**
 * Estimate the fare for a trip between two stops.
 */
export function estimateFare(
  origin: string,
  destination: string,
  mode: string = 'train',
  departureTime?: string
): FareEstimate {
  const distance = lookupDistance(origin, destination);
  const bands = getFareBands(mode);
  
  const band = bands.find(b => distance <= b.maxKm) || bands[bands.length - 1];
  
  let peak = isPeakTime();
  if (departureTime) {
    const depDate = new Date(departureTime);
    if (!Number.isNaN(depDate.getTime())) {
      const day = depDate.getDay();
      const hour = depDate.getHours();
      const minute = depDate.getMinutes();
      const time = hour * 60 + minute;
      
      if (day === 0 || day === 6) {
        peak = false;
      } else {
        peak = (time >= 390 && time < 600) || (time >= 900 && time < 1140);
      }
    }
  }
  
  return {
    adultPeak: band.adultPeak,
    adultOffPeak: band.adultOffPeak,
    isPeakNow: peak,
    currency: 'AUD',
  };
}

/**
 * Format a fare amount for display.
 */
export function formatFare(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
