import type { Handler } from '@netlify/functions';
import { fetchWithTimeout } from '../../lib/http';
import { detectTransportType, getTimingStatus, type TransportType } from '../../lib/trainParsing';
import { isRateLimited, getRateLimitHeaders } from '../../lib/rateLimit';
import { handleCors, CORS_HEADERS } from '../../lib/cors';

type OccupancyLevel = 'empty' | 'low' | 'medium' | 'high' | 'full' | 'unknown';

interface ServiceAlert {
  id: string;
  title: string;
  description: string;
  severity?: 'info' | 'warning' | 'critical';
}

interface FareEstimate {
  adultPeak: number;
  adultOffPeak: number;
  isPeakNow: boolean;
  currency: string;
}

interface JourneyLeg {
  mode: string;
  route: string;
  origin: string;
  destination: string;
  platform?: string;
  scheduledDeparture: string;
  estimatedDeparture?: string;
  scheduledArrival: string;
  estimatedArrival?: string;
  durationMinutes: number;
  stops: number;
  isWalking?: boolean;
}

interface TrainDeparture {
  tripId: string;
  route: string;
  destination?: string;
  platform: string;
  scheduledTime: string;
  estimatedTime?: string;
  status: 'on-time' | 'delayed' | 'cancelled' | 'changed' | 'unknown';
  delayMinutes?: number;
  cancelled: boolean;
  transportType: TransportType;
  occupancy?: OccupancyLevel;
  alerts: ServiceAlert[];
  legs?: JourneyLeg[];
  fareEstimate?: FareEstimate;
}

type RouteMode = TransportType | 'all';

function parseMode(value: string | undefined): RouteMode {
  return value && ['all', 'train', 'metro', 'bus', 'light_rail', 'ferry'].includes(value)
    ? value as RouteMode : 'train';
}

function modeMatches(actual: TransportType, selected: RouteMode): boolean {
  return selected === 'all' || actual === selected;
}

// ─── Platform Extraction ─────────────────────────────────────────────

function extractPlatform(locationOrOrigin: Record<string, unknown>): string {
  // Method 1: properties.platform (Departure Monitor style)
  const props = (locationOrOrigin.properties || {}) as Record<string, string>;
  if (props.platform) return props.platform;

  // Method 2: disassembledName contains "Platform X" (Trip Planner style)
  const disassembled = (locationOrOrigin.disassembledName as string) || '';
  const platMatch = disassembled.match(/[Pp]latform\s*(\d+|[A-Z])/);
  if (platMatch) return platMatch[1];

  // Method 3: trailing number/letter in disassembledName
  const trailingMatch = disassembled.match(/(\d+|[A-Z])$/);
  if (trailingMatch) return trailingMatch[1];

  // Method 4: Check parent properties
  const parent = (locationOrOrigin.parent || {}) as Record<string, unknown>;
  const parentProps = (parent.properties || {}) as Record<string, string>;
  if (parentProps.platform) return parentProps.platform;

  return '';
}

// ─── Occupancy Parsing ──────────────────────────────────────────────

function parseOccupancy(obj: Record<string, unknown>): OccupancyLevel {
  const props = (obj.properties || {}) as Record<string, unknown>;
  const raw = String(props.occupancy || obj.occupancy || '').toLowerCase();
  if (!raw) return 'unknown';
  if (raw.includes('empty') || raw === 'manyseatsavailable' || raw === '1') return 'empty';
  if (raw.includes('low') || raw === 'seatsavailable' || raw === '2') return 'low';
  if (raw.includes('medium') || raw === 'fewseatsavailable' || raw === '3') return 'medium';
  if (raw.includes('high') || raw === 'standingonly' || raw === '4') return 'high';
  if (raw.includes('full') || raw === 'crushedstanding' || raw === '5') return 'full';
  return 'unknown';
}

// ─── Fare Estimation ────────────────────────────────────────────────

function estimateFare(originStopId: string, destinationStopId: string, departureTime: string): FareEstimate {
  const peakRates = [3.61, 4.44, 5.15, 6.49, 8.21];
  const offPeakRates = [2.53, 3.11, 3.61, 4.54, 5.75];
  let bandIndex = 1;
  if (originStopId && destinationStopId) {
    const diff = Math.abs(parseInt(originStopId.slice(0, 3), 10) - parseInt(destinationStopId.slice(0, 3), 10));
    if (diff < 5) bandIndex = 0;
    else if (diff < 15) bandIndex = 1;
    else if (diff < 30) bandIndex = 2;
    else if (diff < 50) bandIndex = 3;
    else bandIndex = 4;
  }
  const isPeakNow = isPeakTime(departureTime);
  return { adultPeak: peakRates[bandIndex], adultOffPeak: offPeakRates[bandIndex], isPeakNow, currency: 'AUD' };
}

function isPeakTime(isoTime: string): boolean {
  if (!isoTime) return true;
  const d = new Date(isoTime);
  if (d.getDay() === 0 || d.getDay() === 6) return false;
  const m = d.getHours() * 60 + d.getMinutes();
  return (m >= 390 && m < 600) || (m >= 900 && m < 1140);
}

// ─── Service Alerts ─────────────────────────────────────────────────

function parseAlerts(infos: Array<Record<string, unknown>>): ServiceAlert[] {
  const alerts: ServiceAlert[] = [];
  for (const info of infos.slice(0, 3)) {
    const title = String(info.title || info.subtitle || '').trim();
    const desc = String(info.content || info.description || '').trim();
    if (!title && !desc) continue;
    const p = String(info.priority || '').toLowerCase();
    const severity: ServiceAlert['severity'] = (p === 'high' || p === 'vhigh') ? 'critical' : p === 'normal' ? 'warning' : 'info';
    alerts.push({ id: String(info.id || `a-${alerts.length}`), title: title || desc.slice(0, 80), description: desc, severity });
  }
  return alerts;
}

// ─────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// Strategy: Trip Planner FIRST (most reliable for A→B), DM as fallback.
// ─────────────────────────────────────────────────────────────────────

const handler: Handler = async (event) => {
  // CORS preflight
  const corsResponse = handleCors(event.httpMethod);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Rate limiting
  const clientIp = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
  const userId = event.headers['x-user-id'] || 'anonymous';
  const rateLimitKey = `${userId}:${clientIp}`;
  if (isRateLimited(rateLimitKey)) {
    return { statusCode: 429, headers: { ...getRateLimitHeaders(rateLimitKey), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Too many requests' }) };
  }

  const routeId = event.queryStringParameters?.id;
  if (!routeId) return { statusCode: 400, body: JSON.stringify({ error: 'id is required' }) };

  try {
    const origin = event.queryStringParameters?.origin || '';
    const destination = event.queryStringParameters?.destination || '';
    const originStopId = event.queryStringParameters?.originStopId || '';
    const destinationStopId = event.queryStringParameters?.destinationStopId || '';
    const selectedMode = parseMode(event.queryStringParameters?.mode);
    const requestedLimit = Number(event.queryStringParameters?.limit || 5);
    const resultLimit = Math.min(Math.max(Math.round(requestedLimit) || 5, 1), 50);

    if (!origin || !destination) {
      return { statusCode: 400, body: JSON.stringify({ error: 'origin and destination are required' }) };
    }

    const apiKey = process.env.TFN_API_KEY;
    if (!apiKey) return { statusCode: 503, body: JSON.stringify({ error: 'TFN_API_KEY not configured' }) };

    // ─── PRIMARY: Trip Planner (best for A→B routing) ──────────────
    // IMPORTANT: Always use station NAMES with type=any for Trip Planner.
    // The Trip Planner handles name resolution far better than raw stop IDs.
    // Only use stopId if it came from the Stop Finder API (7-8 digit EFA format).
    const useOriginId = originStopId && originStopId.length >= 7;
    const useDestId = destinationStopId && destinationStopId.length >= 7;

    const departures = await fetchViaTripPlanner(
      apiKey, origin, destination,
      useOriginId ? originStopId : '',
      useDestId ? destinationStopId : '',
      selectedMode, resultLimit
    );

    if (departures.length > 0) {
      return { statusCode: 200, body: JSON.stringify(departures.slice(0, resultLimit)) };
    }

    // ─── FALLBACK: Departure Monitor (for when Trip Planner returns nothing) ─
    const dmResults = await fetchViaDepartureMonitor(apiKey, origin, destination, originStopId, destinationStopId, selectedMode, resultLimit);
    return { statusCode: 200, body: JSON.stringify(dmResults.slice(0, resultLimit)) };

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch trains', detail: msg }) };
  }
};

// ─────────────────────────────────────────────────────────────────────
// TRIP PLANNER — Primary source for A→B journey results
// ─────────────────────────────────────────────────────────────────────

async function fetchViaTripPlanner(
  apiKey: string,
  origin: string,
  destination: string,
  originStopId: string,
  destinationStopId: string,
  selectedMode: RouteMode,
  resultLimit: number
): Promise<TrainDeparture[]> {
  // Use stop ID only if it's a proper 7-8 digit EFA ID.
  // Otherwise use station name with type=any (Trip Planner resolves it perfectly).
  const originType = (originStopId && originStopId.length >= 7) ? 'stop' : 'any';
  const originName = (originStopId && originStopId.length >= 7) ? originStopId : origin;
  const destType = (destinationStopId && destinationStopId.length >= 7) ? 'stop' : 'any';
  const destName = (destinationStopId && destinationStopId.length >= 7) ? destinationStopId : destination;
  const tripCount = Math.min(Math.max(resultLimit + 3, 8), 20);

  const url = `https://api.transport.nsw.gov.au/v1/tp/trip?outputFormat=rapidJSON&coordOutputFormat=EPSG%3A4326&depArrMacro=dep&type_origin=${originType}&name_origin=${encodeURIComponent(originName)}&type_destination=${destType}&name_destination=${encodeURIComponent(destName)}&calcNumberOfTrips=${tripCount}&TfNSWTR=true&version=10.2.1.42`;

  const res = await fetchWithTimeout(url, { headers: { 'Authorization': `apikey ${apiKey}` } }, 12000);
  if (!res.ok) return [];

  const data = (await res.json()) as Record<string, unknown>;
  const journeys = (data?.journeys || []) as Array<Record<string, unknown>>;
  const departures: TrainDeparture[] = [];
  const seen = new Set<string>();

  for (const journey of journeys) {
    const allLegs = (journey.legs || []) as Array<Record<string, unknown>>;
    const transitLegs = allLegs.filter((leg) => {
      const t = (leg.transportation || {}) as Record<string, unknown>;
      const p = (t.product || {}) as Record<string, unknown>;
      return Number(p.class) !== 100; // Exclude walking
    });

    if (transitLegs.length === 0) continue;

    const firstLeg = transitLegs[0];
    const transportation = (firstLeg.transportation || {}) as Record<string, unknown>;
    const product = (transportation.product || {}) as Record<string, unknown>;
    const productClass = Number(product.class) || 0;
    if (productClass === 100) continue;

    const originInfo = (firstLeg.origin || {}) as Record<string, unknown>;
    const scheduledTime = (originInfo.departureTimePlanned as string) || '';
    const estimatedTime = (originInfo.departureTimeEstimated as string) || undefined;
    if (!scheduledTime) continue;

    // Platform extraction (Fix #2)
    const platform = extractPlatform(originInfo);

    const line = (transportation.disassembledName || transportation.number || '') as string;
    const tripId = (transportation.id as string) || `trip-${departures.length}`;
    const isCancelled = firstLeg.isCancelled === true;

    const { status, delayMinutes } = getTimingStatus(scheduledTime, estimatedTime, isCancelled);
    const productName = (product.name as string) || '';
    const transportType = detectTransportType(productClass, productName, line);

    // Mode filter — for multi-leg, only filter if the PRIMARY leg doesn't match
    if (transitLegs.length === 1 && !modeMatches(transportType, selectedMode)) continue;

    const dedupeKey = `${tripId}:${scheduledTime}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const transportDest = (transportation.destination || {}) as Record<string, unknown>;

    // Multi-leg journey info
    let legs: JourneyLeg[] | undefined;
    if (transitLegs.length > 1) {
      legs = allLegs.map((leg) => {
        const lt = (leg.transportation || {}) as Record<string, unknown>;
        const lp = (lt.product || {}) as Record<string, unknown>;
        const isWalk = Number(lp.class) === 100;
        const lo = (leg.origin || {}) as Record<string, unknown>;
        const ld = (leg.destination || {}) as Record<string, unknown>;
        const lLine = (lt.disassembledName || lt.number || '') as string;
        const lSchedDep = (lo.departureTimePlanned as string) || '';
        const lEstDep = (lo.departureTimeEstimated as string) || undefined;
        const lSchedArr = (ld.arrivalTimePlanned as string) || '';
        const lEstArr = (ld.arrivalTimeEstimated as string) || undefined;
        const lStops = ((leg.stopSequence || []) as unknown[]).length;
        let dur = 0;
        if (lSchedDep && lSchedArr) dur = Math.round((new Date(lSchedArr).getTime() - new Date(lSchedDep).getTime()) / 60000);
        const lMode = isWalk ? 'train' : detectTransportType(Number(lp.class) || 0, (lp.name as string) || '', lLine);
        return {
          mode: isWalk ? 'train' : lMode,
          route: isWalk ? 'Walk' : lLine,
          origin: String((lo as Record<string, unknown>).name || '').replace(/,.*$/, ''),
          destination: String((ld as Record<string, unknown>).name || '').replace(/,.*$/, ''),
          platform: extractPlatform(lo),
          scheduledDeparture: lSchedDep,
          estimatedDeparture: lEstDep,
          scheduledArrival: lSchedArr,
          estimatedArrival: lEstArr,
          durationMinutes: Math.max(0, dur),
          stops: Math.max(0, lStops - 1),
          isWalking: isWalk,
        };
      });
    }

    const alerts = parseAlerts((journey.infos || []) as Array<Record<string, unknown>>);
    const fareEstimate = estimateFare(originStopId, destinationStopId, scheduledTime);

    departures.push({
      tripId,
      route: transitLegs.length > 1
        ? transitLegs.map(l => { const t = (l.transportation || {}) as Record<string, unknown>; return (t.disassembledName || t.number || '') as string; }).filter(Boolean).join(' → ')
        : line,
      destination: String(transportDest.name || destination).replace(/,.*$/, ''),
      platform,
      scheduledTime,
      estimatedTime,
      status,
      delayMinutes,
      cancelled: isCancelled,
      transportType,
      occupancy: 'unknown',
      alerts,
      legs,
      fareEstimate,
    });
  }

  departures.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
  return departures;
}

// ─────────────────────────────────────────────────────────────────────
// DEPARTURE MONITOR — Fallback when Trip Planner returns nothing
// More relaxed destination matching to avoid false negatives.
// ─────────────────────────────────────────────────────────────────────

async function fetchViaDepartureMonitor(
  apiKey: string,
  origin: string,
  destination: string,
  originStopId: string,
  destinationStopId: string,
  selectedMode: RouteMode,
  resultLimit: number
): Promise<TrainDeparture[]> {
  // Only use stopId for DM if it's a proper 7-8 digit EFA ID.
  // The old 6-digit IDs (200060 etc.) cause wrong platform/schedule data.
  let dmName = '';
  let dmType = 'any';

  if (originStopId && originStopId.length >= 7) {
    dmName = originStopId;
    dmType = 'stop';
  }

  if (!dmName) {
    // Try stop finder to get a proper EFA ID
    try {
      const sfUrl = `https://api.transport.nsw.gov.au/v1/tp/stop_finder?outputFormat=rapidJSON&type_sf=stop&name_sf=${encodeURIComponent(origin)}&coordOutputFormat=EPSG%3A4326&TfNSWSF=true&version=10.2.1.42`;
      const sfRes = await fetchWithTimeout(sfUrl, { headers: { 'Authorization': `apikey ${apiKey}` } }, 6000);
      if (sfRes.ok) {
        const sfData = (await sfRes.json()) as Record<string, unknown>;
        const locs = (sfData?.locations || []) as Array<Record<string, unknown>>;
        for (const loc of locs) {
          const locId = String(loc.id || '');
          // Only accept proper 7+ digit EFA IDs
          if (loc.isGlobalId && locId.length >= 7 && (loc.type === 'stop' || loc.type === 'poi')) {
            dmName = locId;
            dmType = 'stop';
            break;
          }
        }
      }
    } catch { /* continue */ }
  }

  // If we still don't have a proper ID, use station name with type=any
  if (!dmName) {
    dmName = origin;
    dmType = 'any';
  }

  const dmUrl = `https://api.transport.nsw.gov.au/v1/tp/departure_mon?outputFormat=rapidJSON&coordOutputFormat=EPSG%3A4326&mode=direct&type_dm=${dmType}&name_dm=${encodeURIComponent(dmName)}&departureMonitorMacro=true&TfNSWDM=true&version=10.2.1.42&limit=50`;

  const res = await fetchWithTimeout(dmUrl, { headers: { 'Authorization': `apikey ${apiKey}` } }, 10000);
  if (!res.ok) return [];

  const data = (await res.json()) as Record<string, unknown>;
  const events = (data?.stopEvents || []) as Array<Record<string, unknown>>;
  if (events.length === 0) return [];

  const departures: TrainDeparture[] = [];
  const seen = new Set<string>();
  const destLower = destination.toLowerCase().replace(/\s*station\s*/gi, '').replace(/\s*wharf\s*/gi, '').trim();

  for (const ev of events.slice(0, 60)) {
    const transportation = (ev.transportation || {}) as Record<string, unknown>;
    const product = (transportation.product || {}) as Record<string, unknown>;
    const productClass = Number(product.class) || 0;
    const productName = (product.name as string) || '';
    const line = (transportation.disassembledName || transportation.number || '') as string;
    const transportType = detectTransportType(productClass, productName, line);
    if (!modeMatches(transportType, selectedMode)) continue;

    // Relaxed destination matching (Fix #1 and #4):
    // Check destination name, onwardLocations, and via text
    if (!servesDestination(ev, destLower, destinationStopId)) continue;

    const scheduledTime = (ev.departureTimePlanned as string) || '';
    const estimatedTime = (ev.departureTimeEstimated as string) || undefined;
    if (!scheduledTime) continue;

    const location = (ev.location || {}) as Record<string, unknown>;
    const platform = extractPlatform(location);
    const isCancelled = ev.isCancelled === true;
    const tripId = (transportation.id as string) || '';

    const dedupeKey = `${tripId}:${scheduledTime}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const { status, delayMinutes } = getTimingStatus(scheduledTime, estimatedTime, isCancelled);
    const transportDest = (transportation.destination || {}) as Record<string, unknown>;

    departures.push({
      tripId: tripId || `dm-${departures.length}`,
      route: line,
      destination: String(transportDest.name || destination).replace(/,.*$/, ''),
      platform,
      scheduledTime,
      estimatedTime,
      status,
      delayMinutes,
      cancelled: isCancelled,
      transportType,
      occupancy: parseOccupancy(ev),
      alerts: parseAlerts((ev.infos || []) as Array<Record<string, unknown>>),
      fareEstimate: estimateFare(originStopId, destinationStopId, scheduledTime),
    });
  }

  departures.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
  return departures;
}

// ─── Relaxed Destination Matching for DM ────────────────────────────

function servesDestination(stopEvent: Record<string, unknown>, destLower: string, destStopId?: string): boolean {
  const transportation = (stopEvent.transportation || {}) as Record<string, unknown>;
  const transportDest = (transportation.destination || {}) as Record<string, unknown>;

  // 1. Check by stop ID if available
  if (destStopId) {
    const destId = String(transportDest.id || '');
    const destParent = (transportDest.parent || {}) as Record<string, unknown>;
    const destParentId = String(destParent.id || '');
    if (destId === destStopId || destParentId === destStopId) return true;

    // Check onward locations by ID
    const onward = (stopEvent.onwardLocations || []) as Array<Record<string, unknown>>;
    for (const stop of onward) {
      if (String(stop.id || '') === destStopId) return true;
      const sp = (stop.parent || {}) as Record<string, unknown>;
      if (String(sp.id || '') === destStopId) return true;
    }
  }

  // 2. Check destination name (includes via handling)
  const destName = String(transportDest.name || '').toLowerCase().replace(/\s*station\s*/gi, '').trim();
  if (destName && (destName.includes(destLower) || destLower.includes(destName))) return true;
  if (destName.includes('via') && destName.includes(destLower)) return true;

  // 3. Check onward locations by name
  const onward = (stopEvent.onwardLocations || []) as Array<Record<string, unknown>>;
  if (onward.length > 0) {
    for (const stop of onward) {
      const sn = String(stop.name || '').toLowerCase().replace(/\s*station\s*/gi, '').trim();
      const parent = (stop.parent || {}) as Record<string, unknown>;
      const pn = String(parent.name || '').toLowerCase().replace(/\s*station\s*/gi, '').trim();
      if ((sn && sn.includes(destLower)) || (pn && pn.includes(destLower))) return true;
      if ((sn && destLower.includes(sn)) || (pn && destLower.includes(pn))) return true;
    }
    return false; // If onward locations exist but don't match, this train doesn't go there
  }

  // 4. City loop heuristic: if destination is a city station and service goes to city
  const cityStations = ['central', 'town hall', 'wynyard', 'circular quay', 'martin place', 'st james', 'museum'];
  const isDestCity = cityStations.some(s => destLower.includes(s));
  const isServiceCity = cityStations.some(s => destName.includes(s));
  if (isDestCity && isServiceCity) return true;

  // 5. If no onward locations and no name match, be optimistic for known direction
  // (DM doesn't always provide onward stops — assume the service might go there if destination name is vague)
  if (onward.length === 0 && !destName) return false;

  return false;
}

export { handler };
