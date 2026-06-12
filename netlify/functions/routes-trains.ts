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
  estimated: boolean;
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
    ? (value as RouteMode)
    : 'train';
}

function modeMatches(actual: TransportType, selected: RouteMode): boolean {
  return selected === 'all' || actual === selected;
}

// ─── Platform Extraction ─────────────────────────────────────────────

function extractPlatform(locationOrOrigin: Record<string, unknown>, transportType?: TransportType): string {
  const isBusOrFerry = transportType === 'bus' || transportType === 'ferry';

  const props = (locationOrOrigin.properties || {}) as Record<string, string>;

  const platformName = props.plannedPlatformName || props.platformName || '';
  if (platformName) {
    const match = platformName.match(/(\d+|[A-Z])$/i);
    return match ? match[1] : platformName;
  }

  const stoppingPoint = props.stoppingPointPlanned || '';
  if (stoppingPoint) {
    const match = stoppingPoint.match(/(\d+|[A-Z])$/i);
    return match ? match[1] : '';
  }

  const disassembled = String(locationOrOrigin.disassembledName || '');
  const platMatch = disassembled.match(/[Pp]latform\s*(\d+|[A-Z])/);
  if (platMatch) return platMatch[1];

  const standMatch = disassembled.match(/[Ss]tand\s+([A-Z0-9])/);
  if (standMatch) return standMatch[1];

  if (isBusOrFerry) return '';

  const area = props.area || '';
  if (area && /^\d+$/.test(area) && Number(area) > 0 && Number(area) <= 30) {
    return area;
  }

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
// This is only a rough estimate, not official Opal pricing.

function estimateFare(originStopId: string, destinationStopId: string, departureTime: string): FareEstimate {
  const peakRates = [3.61, 4.44, 5.15, 6.49, 8.21];
  const offPeakRates = [2.53, 3.11, 3.61, 4.54, 5.75];

  let bandIndex = 1;

  const originNum = Number.parseInt(originStopId.slice(0, 3), 10);
  const destNum = Number.parseInt(destinationStopId.slice(0, 3), 10);

  if (Number.isFinite(originNum) && Number.isFinite(destNum)) {
    const diff = Math.abs(originNum - destNum);

    if (diff < 5) bandIndex = 0;
    else if (diff < 15) bandIndex = 1;
    else if (diff < 30) bandIndex = 2;
    else if (diff < 50) bandIndex = 3;
    else bandIndex = 4;
  }

  const isPeakNow = isPeakTime(departureTime);

  return {
    adultPeak: peakRates[bandIndex],
    adultOffPeak: offPeakRates[bandIndex],
    isPeakNow,
    currency: 'AUD',
    estimated: true,
  };
}

function isPeakTime(isoTime: string): boolean {
  if (!isoTime) return true;

  const d = new Date(isoTime);
  if (Number.isNaN(d.getTime())) return true;

  if (d.getDay() === 0 || d.getDay() === 6) return false;

  const minutes = d.getHours() * 60 + d.getMinutes();

  return (minutes >= 390 && minutes < 600) || (minutes >= 900 && minutes < 1140);
}

// ─── Service Alerts ─────────────────────────────────────────────────

function parseAlerts(infos: Array<Record<string, unknown>>): ServiceAlert[] {
  const alerts: ServiceAlert[] = [];

  for (const info of infos.slice(0, 3)) {
    const title = String(info.title || info.subtitle || '').trim();
    const desc = String(info.content || info.description || '').trim();

    if (!title && !desc) continue;

    const priority = String(info.priority || '').toLowerCase();

    const severity: ServiceAlert['severity'] =
      priority === 'high' || priority === 'vhigh'
        ? 'critical'
        : priority === 'normal'
          ? 'warning'
          : 'info';

    alerts.push({
      id: String(info.id || `a-${alerts.length}`),
      title: title || desc.slice(0, 80),
      description: desc,
      severity,
    });
  }

  return alerts;
}

// ─────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// Strategy: Trip Planner first, Departure Monitor fallback.
// ─────────────────────────────────────────────────────────────────────

const handler: Handler = async (event) => {
  const corsResponse = handleCors(event.httpMethod);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const clientIp = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
  const userId = event.headers['x-user-id'] || 'anonymous';
  const rateLimitKey = `${userId}:${clientIp}`;

  if (isRateLimited(rateLimitKey)) {
    return {
      statusCode: 429,
      headers: {
        ...CORS_HEADERS,
        ...getRateLimitHeaders(rateLimitKey),
      },
      body: JSON.stringify({ error: 'Too many requests' }),
    };
  }

  const routeId = event.queryStringParameters?.id;

  if (!routeId) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'id is required' }),
    };
  }

  try {
    const origin = event.queryStringParameters?.origin || '';
    const destination = event.queryStringParameters?.destination || '';
    const originStopId = event.queryStringParameters?.originStopId || '';
    const destinationStopId = event.queryStringParameters?.destinationStopId || '';
    const selectedMode = parseMode(event.queryStringParameters?.mode);
    const requestedLimit = Number(event.queryStringParameters?.limit || 5);
    const resultLimit = Math.min(Math.max(Math.round(requestedLimit) || 5, 1), 50);

    if (!origin || !destination) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'origin and destination are required' }),
      };
    }

    const apiKey = process.env.TFN_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 503,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'TFN_API_KEY not configured' }),
      };
    }

    let resolvedOriginId = originStopId;
    let resolvedDestId = destinationStopId;

    if (!resolvedOriginId) {
      resolvedOriginId = await resolveStopId(apiKey, origin);
    }

    if (!resolvedDestId) {
      resolvedDestId = await resolveStopId(apiKey, destination);
    }

    // Strategy: Use Departure Monitor for bulk results (like Opal app does).
    // DM returns 40+ departures. We filter by destination using onwardLocations.
    // Fall back to Trip Planner only if DM returns nothing.
    let departures: TrainDeparture[] = [];

    if (resolvedOriginId) {
      departures = await fetchViaDepartureMonitor(
        apiKey, origin, destination, resolvedOriginId, resolvedDestId, selectedMode, resultLimit
      );
    }

    // If DM didn't return enough, supplement with Trip Planner
    if (departures.length < resultLimit) {
      const tripPlannerResults = await fetchViaTripPlanner(
        apiKey, origin, destination, resolvedOriginId, resolvedDestId, selectedMode, resultLimit
      );
      // Merge, deduplicate
      const seen = new Set(departures.map(d => `${d.tripId}:${d.scheduledTime}`));
      for (const dep of tripPlannerResults) {
        if (!seen.has(`${dep.tripId}:${dep.scheduledTime}`)) {
          departures.push(dep);
        }
      }
      departures.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
    }

    if (departures.length > 0) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(departures.slice(0, resultLimit)),
      };
    }

    const dmResults = await fetchViaDepartureMonitor(
      apiKey,
      origin,
      destination,
      resolvedOriginId,
      resolvedDestId,
      selectedMode,
      resultLimit
    );

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(dmResults.slice(0, resultLimit)),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';

    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Failed to fetch trains',
        detail: msg,
      }),
    };
  }
};

// ─────────────────────────────────────────────────────────────────────
// STOP ID RESOLUTION
// ─────────────────────────────────────────────────────────────────────

async function resolveStopId(apiKey: string, stationName: string): Promise<string> {
  try {
    const sfUrl =
      `https://api.transport.nsw.gov.au/v1/tp/stop_finder` +
      `?outputFormat=rapidJSON` +
      `&type_sf=any` +
      `&name_sf=${encodeURIComponent(stationName)}` +
      `&coordOutputFormat=EPSG%3A4326` +
      `&TfNSWSF=true` +
      `&version=10.2.1.42`;

    const res = await fetchWithTimeout(
      sfUrl,
      {
        headers: {
          Authorization: `apikey ${apiKey}`,
        },
      },
      8000
    );

    if (!res.ok) return '';

    const data = (await res.json()) as Record<string, unknown>;
    const locations = (data.locations || []) as Array<Record<string, unknown>>;

    for (const loc of locations) {
      if (loc.isGlobalId && loc.type === 'stop' && loc.id) {
        return String(loc.id);
      }
    }

    for (const loc of locations) {
      if (loc.type === 'stop' && loc.id) {
        return String(loc.id);
      }
    }
  } catch {
    return '';
  }

  return '';
}

// ─────────────────────────────────────────────────────────────────────
// TRIP PLANNER
// ─────────────────────────────────────────────────────────────────────

async function fetchViaTripPlanner(
  apiKey: string,
  origin: string,
  destination: string,
  originStopId: string,
  destinationStopId: string,
  selectedMode: RouteMode,
  resultLimit: number,
  afterTime?: string
): Promise<TrainDeparture[]> {
  const originType = originStopId ? 'stop' : 'any';
  const originName = originStopId || origin;

  const destType = destinationStopId ? 'stop' : 'any';
  const destName = destinationStopId || destination;

  const tripCount = Math.min(Math.max(resultLimit * 2, 12), 30);

  // Build time offset if requesting next batch
  let timeParams = '';
  if (afterTime) {
    const d = new Date(afterTime);
    // Add 1 minute to avoid getting the same last result
    d.setMinutes(d.getMinutes() + 1);
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    timeParams = `&itdDate=${dateStr}&itdTime=${timeStr}`;
  }

  const url =
    `https://api.transport.nsw.gov.au/v1/tp/trip` +
    `?outputFormat=rapidJSON` +
    `&coordOutputFormat=EPSG%3A4326` +
    `&depArrMacro=dep` +
    `&type_origin=${originType}` +
    `&name_origin=${encodeURIComponent(originName)}` +
    `&type_destination=${destType}` +
    `&name_destination=${encodeURIComponent(destName)}` +
    `&calcNumberOfTrips=${tripCount}` +
    `&TfNSWTR=true` +
    `&version=10.2.1.42` +
    timeParams;

  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        Authorization: `apikey ${apiKey}`,
      },
    },
    15000
  );

  if (!res.ok) return [];

  const data = (await res.json()) as Record<string, unknown>;
  const journeys = (data.journeys || []) as Array<Record<string, unknown>>;

  if (journeys.length === 0) return [];

  const departures: TrainDeparture[] = [];
  const seen = new Set<string>();

  for (const journey of journeys) {
    const allLegs = (journey.legs || []) as Array<Record<string, unknown>>;

    const transitLegs = allLegs.filter((leg) => {
      const transportation = (leg.transportation || {}) as Record<string, unknown>;
      const product = (transportation.product || {}) as Record<string, unknown>;
      return Number(product.class) !== 100;
    });

    if (transitLegs.length === 0) continue;

    const firstLeg = transitLegs[0];

    const transportation = (firstLeg.transportation || {}) as Record<string, unknown>;
    const product = (transportation.product || {}) as Record<string, unknown>;

    const productClass = Number(product.class) || 0;
    if (productClass === 100) continue;

    const originInfo = (firstLeg.origin || {}) as Record<string, unknown>;

    const scheduledTime = String(originInfo.departureTimePlanned || '');
    const estimatedTimeRaw = String(originInfo.departureTimeEstimated || '');
    const estimatedTime = estimatedTimeRaw || undefined;

    if (!scheduledTime) continue;

    const line = String(transportation.disassembledName || transportation.number || '');
    const tripId = String(transportation.id || `trip-${departures.length}`);
    const isCancelled = firstLeg.isCancelled === true;

    const productName = String(product.name || '');
    const transportType = detectTransportType(productClass, productName, line);

    if (selectedMode !== 'all' && !modeMatches(transportType, selectedMode)) {
      continue;
    }

    const platform = extractPlatform(originInfo, transportType);

    const dedupeKey = `${tripId}:${scheduledTime}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const { status, delayMinutes } = getTimingStatus(scheduledTime, estimatedTime, isCancelled);

    const transportDest = (transportation.destination || {}) as Record<string, unknown>;

    let legs: JourneyLeg[] | undefined;

    if (selectedMode === 'all' && transitLegs.length > 1) {
      legs = allLegs.map((leg) => {
        const lt = (leg.transportation || {}) as Record<string, unknown>;
        const lp = (lt.product || {}) as Record<string, unknown>;

        const isWalk = Number(lp.class) === 100;

        const lo = (leg.origin || {}) as Record<string, unknown>;
        const ld = (leg.destination || {}) as Record<string, unknown>;

        const lLine = String(lt.disassembledName || lt.number || '');
        const lSchedDep = String(lo.departureTimePlanned || '');
        const lEstDepRaw = String(lo.departureTimeEstimated || '');
        const lEstDep = lEstDepRaw || undefined;

        const lSchedArr = String(ld.arrivalTimePlanned || '');
        const lEstArrRaw = String(ld.arrivalTimeEstimated || '');
        const lEstArr = lEstArrRaw || undefined;

        const lStops = ((leg.stopSequence || []) as unknown[]).length;

        let durationMinutes = 0;

        if (lSchedDep && lSchedArr) {
          const depMs = new Date(lSchedDep).getTime();
          const arrMs = new Date(lSchedArr).getTime();

          if (!Number.isNaN(depMs) && !Number.isNaN(arrMs)) {
            durationMinutes = Math.max(0, Math.round((arrMs - depMs) / 60000));
          }
        }

        const detectedLegMode = isWalk
          ? 'walk'
          : detectTransportType(Number(lp.class) || 0, String(lp.name || ''), lLine);

        return {
          mode: detectedLegMode,
          route: isWalk ? 'Walk' : lLine,
          origin: String(lo.name || '').replace(/,.*$/, ''),
          destination: String(ld.name || '').replace(/,.*$/, ''),
          platform: isWalk ? '' : extractPlatform(lo, detectedLegMode as TransportType),
          scheduledDeparture: lSchedDep,
          estimatedDeparture: lEstDep,
          scheduledArrival: lSchedArr,
          estimatedArrival: lEstArr,
          durationMinutes,
          stops: Math.max(0, lStops - 1),
          isWalking: isWalk,
        };
      });
    }

    const alerts = parseAlerts((journey.infos || []) as Array<Record<string, unknown>>);
    const fareEstimate = estimateFare(originStopId, destinationStopId, scheduledTime);

    departures.push({
      tripId,
      route: line,
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

  departures.sort((a, b) => {
    return new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime();
  });

  return departures;
}

// ─────────────────────────────────────────────────────────────────────
// DEPARTURE MONITOR FALLBACK
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
  let dmName = originStopId || '';
  let dmType = originStopId ? 'stop' : 'any';

  if (!dmName) {
    dmName = await resolveStopId(apiKey, origin);

    if (dmName) {
      dmType = 'stop';
    } else {
      dmName = origin;
      dmType = 'any';
    }
  }

  const dmUrl =
    `https://api.transport.nsw.gov.au/v1/tp/departure_mon` +
    `?outputFormat=rapidJSON` +
    `&coordOutputFormat=EPSG%3A4326` +
    `&mode=direct` +
    `&type_dm=${dmType}` +
    `&name_dm=${encodeURIComponent(dmName)}` +
    `&departureMonitorMacro=true` +
    `&TfNSWDM=true` +
    `&version=10.2.1.42` +
    `&limit=50`;

  const res = await fetchWithTimeout(
    dmUrl,
    {
      headers: {
        Authorization: `apikey ${apiKey}`,
      },
    },
    10000
  );

  if (!res.ok) return [];

  const data = (await res.json()) as Record<string, unknown>;
  const events = (data.stopEvents || []) as Array<Record<string, unknown>>;

  if (events.length === 0) return [];

  const departures: TrainDeparture[] = [];
  const seen = new Set<string>();

  const destLower = destination
    .toLowerCase()
    .replace(/\s*station\s*/gi, '')
    .replace(/\s*wharf\s*/gi, '')
    .trim();

  for (const ev of events.slice(0, 60)) {
    const transportation = (ev.transportation || {}) as Record<string, unknown>;
    const product = (transportation.product || {}) as Record<string, unknown>;

    const productClass = Number(product.class) || 0;
    const productName = String(product.name || '');
    const line = String(transportation.disassembledName || transportation.number || '');

    const transportType = detectTransportType(productClass, productName, line);

    if (!modeMatches(transportType, selectedMode)) continue;

    if (!servesDestination(ev, destLower, destinationStopId)) continue;

    const scheduledTime = String(ev.departureTimePlanned || '');
    const estimatedTimeRaw = String(ev.departureTimeEstimated || '');
    const estimatedTime = estimatedTimeRaw || undefined;

    if (!scheduledTime) continue;

    const location = (ev.location || {}) as Record<string, unknown>;
    const platform = extractPlatform(location, transportType);

    const isCancelled = ev.isCancelled === true;
    const tripId = String(transportation.id || '');

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

  departures.sort((a, b) => {
    return new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime();
  });

  return departures.slice(0, resultLimit);
}

// ─── Destination Matching for Departure Monitor ──────────────────────

function servesDestination(
  stopEvent: Record<string, unknown>,
  destLower: string,
  destStopId?: string
): boolean {
  const transportation = (stopEvent.transportation || {}) as Record<string, unknown>;
  const transportDest = (transportation.destination || {}) as Record<string, unknown>;

  if (destStopId) {
    const destId = String(transportDest.id || '');
    const destParent = (transportDest.parent || {}) as Record<string, unknown>;
    const destParentId = String(destParent.id || '');

    if (destId === destStopId || destParentId === destStopId) {
      return true;
    }

    const onward = (stopEvent.onwardLocations || []) as Array<Record<string, unknown>>;

    for (const stop of onward) {
      if (String(stop.id || '') === destStopId) return true;

      const stopParent = (stop.parent || {}) as Record<string, unknown>;
      if (String(stopParent.id || '') === destStopId) return true;
    }
  }

  const destName = String(transportDest.name || '')
    .toLowerCase()
    .replace(/\s*station\s*/gi, '')
    .trim();

  if (destName && (destName.includes(destLower) || destLower.includes(destName))) {
    return true;
  }

  if (destName.includes('via') && destName.includes(destLower)) {
    return true;
  }

  const onward = (stopEvent.onwardLocations || []) as Array<Record<string, unknown>>;

  if (onward.length > 0) {
    for (const stop of onward) {
      const stopName = String(stop.name || '')
        .toLowerCase()
        .replace(/\s*station\s*/gi, '')
        .trim();

      const parent = (stop.parent || {}) as Record<string, unknown>;

      const parentName = String(parent.name || '')
        .toLowerCase()
        .replace(/\s*station\s*/gi, '')
        .trim();

      if ((stopName && stopName.includes(destLower)) || (parentName && parentName.includes(destLower))) {
        return true;
      }

      if ((stopName && destLower.includes(stopName)) || (parentName && destLower.includes(parentName))) {
        return true;
      }
    }

    return false;
  }

  const cityStations = [
    'central',
    'town hall',
    'wynyard',
    'circular quay',
    'martin place',
    'st james',
    'museum',
  ];

  const isDestCity = cityStations.some((station) => destLower.includes(station));
  const isServiceCity = cityStations.some((station) => destName.includes(station));

  if (isDestCity && isServiceCity) {
    return true;
  }

  if (onward.length === 0 && !destName) {
    return false;
  }

  return false;
}

export { handler };