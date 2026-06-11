import type { Handler } from '@netlify/functions';
import { fetchWithTimeout } from '../../lib/http';
import { detectTransportType, getTimingStatus, matchesDestination, type TransportType } from '../../lib/trainParsing';
import { isRateLimited, getRateLimitHeaders } from '../../lib/rateLimit';

type OccupancyLevel = 'empty' | 'low' | 'medium' | 'high' | 'full' | 'unknown';

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

interface FareEstimate {
  adultPeak: number;
  adultOffPeak: number;
  isPeakNow: boolean;
  currency: string;
}

interface ServiceAlert {
  id: string;
  title: string;
  description: string;
  severity?: 'info' | 'warning' | 'critical';
  affectedLines?: string[];
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
  transportType: 'train' | 'metro' | 'bus' | 'light_rail' | 'ferry';
  occupancy?: OccupancyLevel;
  alerts: ServiceAlert[];
  legs?: JourneyLeg[];
  fareEstimate?: FareEstimate;
}

type RouteMode = TransportType | 'all';

function parseMode(value: string | undefined): RouteMode {
  return value && ['all', 'train', 'metro', 'bus', 'light_rail', 'ferry'].includes(value)
    ? value as RouteMode
    : 'train';
}

function modeMatches(actual: TransportType, selected: RouteMode): boolean {
  return selected === 'all' || actual === selected;
}

function idsMatch(value: unknown, targetId: string): boolean {
  return typeof value === 'string' && value === targetId;
}

function serviceMatchesDestination(
  serviceDestination: Record<string, unknown>,
  targetDestination: string,
  targetStopId?: string
): boolean {
  const parent = (serviceDestination.parent || {}) as Record<string, unknown>;
  if (targetStopId && (idsMatch(serviceDestination.id, targetStopId) || idsMatch(parent.id, targetStopId))) {
    return true;
  }
  return matchesDestination(String(serviceDestination.name || ''), targetDestination);
}

function stopSequenceContainsDestination(
  stopSequence: Array<Record<string, unknown>>,
  targetDestination: string,
  targetStopId?: string
): boolean {
  const targetLower = targetDestination.toLowerCase();
  return stopSequence.some((stop) => {
    const parent = (stop.parent || {}) as Record<string, unknown>;
    if (targetStopId && (idsMatch(stop.id, targetStopId) || idsMatch(parent.id, targetStopId))) {
      return true;
    }
    const stopName = String(stop.name || '').toLowerCase();
    const parentName = String(parent.name || '').toLowerCase();
    return stopName.includes(targetLower) || parentName.includes(targetLower);
  });
}

function stopEventServesDestination(
  stopEvent: Record<string, unknown>,
  targetDestination: string,
  targetStopId?: string
): boolean {
  const onwardLocations = (stopEvent.onwardLocations || []) as Array<Record<string, unknown>>;
  if (onwardLocations.length > 0) {
    return stopSequenceContainsDestination(onwardLocations, targetDestination, targetStopId);
  }

  const transportation = (stopEvent.transportation || {}) as Record<string, unknown>;
  const transportDest = (transportation.destination || {}) as Record<string, unknown>;
  return serviceMatchesDestination(transportDest, targetDestination, targetStopId);
}

// ─── Occupancy Parsing ──────────────────────────────────────────────

function parseOccupancy(stopEvent: Record<string, unknown>): OccupancyLevel {
  // TfNSW returns occupancy info in properties or as a direct field
  const properties = (stopEvent.properties || {}) as Record<string, unknown>;
  const occupancy = (properties.occupancy || stopEvent.occupancy || '') as string;
  const occ = occupancy.toLowerCase();
  if (occ.includes('empty') || occ === 'manyseatsavailable' || occ === '1') return 'empty';
  if (occ.includes('low') || occ === 'seatsavailable' || occ === '2') return 'low';
  if (occ.includes('medium') || occ === 'fewseatsavailable' || occ === '3') return 'medium';
  if (occ.includes('high') || occ === 'standingonly' || occ === '4') return 'high';
  if (occ.includes('full') || occ === 'crushedstanding' || occ === '5') return 'full';
  return 'unknown';
}

// ─── Fare Estimation (Sydney Opal fare bands) ───────────────────────

function estimateFare(originStopId: string, destinationStopId: string, departureTime: string): FareEstimate {
  // Sydney Opal fares are distance-based. Without exact tap data, 
  // estimate using band system (0-10km, 10-20km, 20-35km, 35-65km, 65+km)
  // These are 2024/2025 adult Opal card rates
  const peakRates = [3.61, 4.44, 5.15, 6.49, 8.21];
  const offPeakRates = [2.53, 3.11, 3.61, 4.54, 5.75];

  // Rough distance estimation based on stop IDs (first digits indicate area)
  let bandIndex = 0;
  if (originStopId && destinationStopId) {
    const originPrefix = parseInt(originStopId.slice(0, 3), 10);
    const destPrefix = parseInt(destinationStopId.slice(0, 3), 10);
    const prefixDiff = Math.abs(originPrefix - destPrefix);
    if (prefixDiff < 5) bandIndex = 0;
    else if (prefixDiff < 15) bandIndex = 1;
    else if (prefixDiff < 30) bandIndex = 2;
    else if (prefixDiff < 50) bandIndex = 3;
    else bandIndex = 4;
  } else {
    bandIndex = 1; // default to band 2 if we can't estimate
  }

  // Determine peak/off-peak
  const isPeakNow = isPeakTime(departureTime);

  return {
    adultPeak: peakRates[bandIndex],
    adultOffPeak: offPeakRates[bandIndex],
    isPeakNow,
    currency: 'AUD',
  };
}

function isPeakTime(isoTime: string): boolean {
  if (!isoTime) return true;
  const date = new Date(isoTime);
  const day = date.getDay();
  // Weekends are always off-peak
  if (day === 0 || day === 6) return false;
  const hour = date.getHours();
  const minute = date.getMinutes();
  const timeMinutes = hour * 60 + minute;
  // Peak: 6:30-10:00 and 15:00-19:00 on weekdays
  return (timeMinutes >= 390 && timeMinutes < 600) || (timeMinutes >= 900 && timeMinutes < 1140);
}

// ─── Service Alerts Parsing ──────────────────────────────────────────

function parseServiceAlerts(infos: Array<Record<string, unknown>>): ServiceAlert[] {
  const alerts: ServiceAlert[] = [];
  for (const info of infos.slice(0, 5)) {
    const title = String(info.title || info.subtitle || '').trim();
    const desc = String(info.content || info.description || '').trim();
    if (!title && !desc) continue;
    
    const priorityStr = String(info.priority || '').toLowerCase();
    let severity: 'info' | 'warning' | 'critical' = 'info';
    if (priorityStr === 'high' || priorityStr === 'vhigh') severity = 'critical';
    else if (priorityStr === 'normal' || priorityStr === 'medium') severity = 'warning';

    alerts.push({
      id: String(info.id || `alert-${alerts.length}`),
      title: title || desc.slice(0, 80),
      description: desc,
      severity,
    });
  }
  return alerts;
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Rate limiting (feature 38)
  const clientIp = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
  const userId = event.headers['x-user-id'] || 'anonymous';
  const rateLimitKey = `${userId}:${clientIp}`;
  if (isRateLimited(rateLimitKey)) {
    return {
      statusCode: 429,
      headers: { ...getRateLimitHeaders(rateLimitKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Too many requests. Please wait a moment.' }),
    };
  }

  const routeId = event.queryStringParameters?.id;
  if (!routeId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'id query parameter is required' }) };
  }

  try {
    // Get origin/destination from query params (sent by frontend)
    const origin = event.queryStringParameters?.origin || '';
    const destination = event.queryStringParameters?.destination || '';
    const originStopId = event.queryStringParameters?.originStopId || '';
    const destinationStopId = event.queryStringParameters?.destinationStopId || '';
    const selectedMode = parseMode(event.queryStringParameters?.mode);
    const requestedLimit = Number(event.queryStringParameters?.limit || 5);
    const resultLimit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.round(requestedLimit), 1), 50)
      : 5;

    if (!origin || !destination) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Origin and destination query params are required' }) };
    }

    const apiKey = process.env.TFN_API_KEY;
    if (!apiKey) {
      return { statusCode: 503, body: JSON.stringify({ error: 'TFN_API_KEY is not configured' }) };
    }

    // Use stop ID if available, otherwise try to resolve station name
    let dmName = originStopId || '';
    let dmType = 'stop';
    
    if (!dmName) {
      // Try resolving the station name to an ID via stop finder
      const sfUrl = `https://api.transport.nsw.gov.au/v1/tp/stop_finder?outputFormat=rapidJSON&type_sf=any&name_sf=${encodeURIComponent(origin)}&coordOutputFormat=EPSG%3A4326&TfNSWSF=true&version=10.2.1.42`;
      try {
        const sfRes = await fetchWithTimeout(sfUrl, { headers: { 'Authorization': `apikey ${apiKey}` } });
        if (sfRes.ok) {
          const sfData = (await sfRes.json()) as Record<string, unknown>;
          const locations = (sfData?.locations || []) as Array<Record<string, unknown>>;
          // Find the first stop/station type result with a global ID
          for (const loc of locations) {
            if (loc.isGlobalId && loc.type === 'stop') {
              dmName = loc.id as string;
              break;
            }
          }
        }
      } catch { /* continue without ID */ }
      
      if (!dmName) {
        dmName = origin;
        dmType = 'any';
      }
    }

    // Departure monitor - request up to 90 min of departures with limit=40
    const dmUrl = `https://api.transport.nsw.gov.au/v1/tp/departure_mon?outputFormat=rapidJSON&coordOutputFormat=EPSG%3A4326&mode=direct&type_dm=${dmType}&name_dm=${encodeURIComponent(dmName)}&departureMonitorMacro=true&TfNSWDM=true&version=10.2.1.42&limit=40`;

    const dmResponse = await fetchWithTimeout(dmUrl, {
      headers: { 'Authorization': `apikey ${apiKey}` },
    });

    if (dmResponse.ok) {
      const dmData = (await dmResponse.json()) as Record<string, unknown>;
      const events = ((dmData?.stopEvents || []) as Array<Record<string, unknown>>);

      if (events.length > 0) {
        const departures: TrainDeparture[] = [];
        const seenTrips = new Set<string>(); // Deduplicate by tripId + scheduledTime
        for (const stopEvent of events.slice(0, 80)) {
          const transportation = (stopEvent.transportation || {}) as Record<string, unknown>;
          const line = (transportation.disassembledName || transportation.number || '') as string;
          const product = (transportation.product || {}) as Record<string, unknown>;
          const productClass = product.class as number || 0;
          const productName = (product.name as string) || '';
          const transportType = detectTransportType(productClass, productName, line);
          if (!modeMatches(transportType, selectedMode)) continue;

          const transportDest = (transportation.destination || {}) as Record<string, unknown>;
          if (!stopEventServesDestination(stopEvent, destination, destinationStopId)) continue;

          const scheduledTime = (stopEvent.departureTimePlanned as string) || '';
          const estimatedTime = (stopEvent.departureTimeEstimated as string) || undefined;
          const location = (stopEvent.location || {}) as Record<string, unknown>;
          const locationProps = (location.properties || {}) as Record<string, string>;
          const platform = locationProps.platform || '';
          const isCancelled = stopEvent.isCancelled === true;
          const tripId = (transportation.id as string) || '';

          // Deduplicate: skip if same trip+time already seen
          const dedupeKey = `${tripId}:${scheduledTime}`;
          if (seenTrips.has(dedupeKey)) continue;
          seenTrips.add(dedupeKey);

          const { status, delayMinutes } = getTimingStatus(scheduledTime, estimatedTime, isCancelled);

          // Parse occupancy from stop event
          const occupancy = parseOccupancy(stopEvent);

          // Parse service alerts from stop event infos
          const infos = (stopEvent.infos || []) as Array<Record<string, unknown>>;
          const alerts = parseServiceAlerts(infos);

          // Estimate fare
          const fareEstimate = estimateFare(originStopId, destinationStopId, scheduledTime);

          departures.push({
            tripId: tripId || `trip-${departures.length}`,
            route: line,
            destination: String(transportDest.name || destination),
            platform,
            scheduledTime,
            estimatedTime,
            status,
            delayMinutes,
            cancelled: isCancelled,
            transportType,
            occupancy,
            alerts,
            fareEstimate,
          });
        }

        if (departures.length > 0) {
          departures.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
          return { statusCode: 200, body: JSON.stringify(departures.slice(0, resultLimit)) };
        }
      }
    }

    // Fallback: try Trip Planner API
    const originType = originStopId ? 'stop' : 'any';
    const originName = originStopId || origin;
    const destinationType = destinationStopId ? 'stop' : 'any';
    const destinationName = destinationStopId || destination;
    const tripCount = Math.min(Math.max(resultLimit + 2, 6), 20);
    const tripUrl = `https://api.transport.nsw.gov.au/v1/tp/trip?outputFormat=rapidJSON&coordOutputFormat=EPSG%3A4326&depArrMacro=dep&type_origin=${originType}&name_origin=${encodeURIComponent(originName)}&type_destination=${destinationType}&name_destination=${encodeURIComponent(destinationName)}&calcNumberOfTrips=${tripCount}&TfNSWTR=true&version=10.2.1.42`;

    const tripResponse = await fetchWithTimeout(tripUrl, {
      headers: { 'Authorization': `apikey ${apiKey}` },
    });

    if (!tripResponse.ok) {
      // Fallback to departure monitor
      return await fallbackDepartureMon(apiKey, origin, destination, originStopId, destinationStopId, resultLimit, selectedMode);
    }

    const tripData = (await tripResponse.json()) as Record<string, unknown>;
    const journeys = (tripData?.journeys || []) as Array<Record<string, unknown>>;

    const departures: TrainDeparture[] = [];
    const seenTrips = new Set<string>();

    for (const journey of journeys) {
      const legs = (journey.legs || []) as Array<Record<string, unknown>>;
      const transitLegs = legs.filter((candidate) => {
        const candidateTransportation = (candidate.transportation || {}) as Record<string, unknown>;
        const candidateProduct = (candidateTransportation.product || {}) as Record<string, unknown>;
        return Number(candidateProduct.class) !== 100;
      });
      
      // Support both single-leg and multi-leg journeys
      if (transitLegs.length === 0) continue;

      const isMultiLeg = transitLegs.length > 1;
      const firstLeg = transitLegs[0];
      const transportation = (firstLeg.transportation || {}) as Record<string, unknown>;
      const product = (transportation.product || {}) as Record<string, unknown>;
      if ((product.class as number) === 100) continue; // Skip walking

      const originInfo = (firstLeg.origin || {}) as Record<string, unknown>;
      const scheduledTime = (originInfo.departureTimePlanned as string) || '';
      const estimatedTime = (originInfo.departureTimeEstimated as string) || undefined;

      const platformRaw = (originInfo.disassembledName as string) || '';
      const platformMatch = platformRaw.match(/(\d+|[A-Z])$/);
      const platform = platformMatch ? platformMatch[1] : '';

      const line = (transportation.disassembledName || transportation.number || '') as string;
      const tripId = (transportation.id as string) || `trip-${departures.length}`;
      const isCancelled = firstLeg.isCancelled === true;

      const stopSequence = (firstLeg.stopSequence || []) as Array<Record<string, unknown>>;
      if (!isMultiLeg && stopSequence.length > 0) {
        const stopsAtDest = stopSequenceContainsDestination(stopSequence, destination, destinationStopId);
        if (!stopsAtDest) continue;
      }

      const { status, delayMinutes } = getTimingStatus(scheduledTime, estimatedTime, isCancelled);

      const productClass = product.class as number || 0;
      const productName = (product.name as string) || '';
      const transportType = detectTransportType(productClass, productName, line);
      if (!isMultiLeg && !modeMatches(transportType, selectedMode)) continue;
      const dedupeKey = `${tripId}:${scheduledTime}:${platform}:${transportType}`;
      if (seenTrips.has(dedupeKey)) continue;
      seenTrips.add(dedupeKey);
      const transportDest = (transportation.destination || {}) as Record<string, unknown>;

      // Build multi-leg info
      let journeyLegs: JourneyLeg[] | undefined;
      if (isMultiLeg) {
        journeyLegs = [];
        for (const leg of legs) {
          const legTransport = (leg.transportation || {}) as Record<string, unknown>;
          const legProduct = (legTransport.product || {}) as Record<string, unknown>;
          const legClass = Number(legProduct.class) || 0;
          const isWalking = legClass === 100;
          const legOrigin = (leg.origin || {}) as Record<string, unknown>;
          const legDest = (leg.destination || {}) as Record<string, unknown>;
          const legLine = (legTransport.disassembledName || legTransport.number || '') as string;
          const legStops = ((leg.stopSequence || []) as Array<unknown>).length;
          const legSchedDep = (legOrigin.departureTimePlanned as string) || '';
          const legEstDep = (legOrigin.departureTimeEstimated as string) || undefined;
          const legSchedArr = (legDest.arrivalTimePlanned as string) || '';
          const legEstArr = (legDest.arrivalTimeEstimated as string) || undefined;
          const legPlatformRaw = (legOrigin.disassembledName as string) || '';
          const legPlatformMatch = legPlatformRaw.match(/(\d+|[A-Z])$/);

          let durationMinutes = 0;
          if (legSchedDep && legSchedArr) {
            durationMinutes = Math.round((new Date(legSchedArr).getTime() - new Date(legSchedDep).getTime()) / 60000);
          }

          const legProductName = (legProduct.name as string) || '';
          const legMode = isWalking ? 'train' : detectTransportType(legClass, legProductName, legLine);

          journeyLegs.push({
            mode: isWalking ? 'train' : legMode,
            route: isWalking ? 'Walk' : legLine,
            origin: String((legOrigin.parent as Record<string, unknown>)?.name || legOrigin.name || ''),
            destination: String((legDest.parent as Record<string, unknown>)?.name || legDest.name || ''),
            platform: legPlatformMatch ? legPlatformMatch[1] : undefined,
            scheduledDeparture: legSchedDep,
            estimatedDeparture: legEstDep,
            scheduledArrival: legSchedArr,
            estimatedArrival: legEstArr,
            durationMinutes: Math.max(0, durationMinutes),
            stops: Math.max(0, legStops - 1),
            isWalking,
          });
        }
      }

      // Parse alerts from journey
      const journeyInfos = ((journey.infos || []) as Array<Record<string, unknown>>);
      const alerts = parseServiceAlerts(journeyInfos);

      // Fare estimate
      const fareEstimate = estimateFare(originStopId, destinationStopId, scheduledTime);

      departures.push({
        tripId,
        route: isMultiLeg ? transitLegs.map(l => {
          const t = (l.transportation || {}) as Record<string, unknown>;
          return (t.disassembledName || t.number || '') as string;
        }).filter(Boolean).join(' → ') : line,
        destination: String(transportDest.name || destination),
        platform,
        scheduledTime,
        estimatedTime,
        status,
        delayMinutes,
        cancelled: isCancelled,
        transportType,
        occupancy: 'unknown',
        alerts,
        legs: journeyLegs,
        fareEstimate,
      });
    }

    departures.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
    return { statusCode: 200, body: JSON.stringify(departures.slice(0, resultLimit)) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch live trains', detail: msg }) };
  }
};

async function fallbackDepartureMon(
  apiKey: string,
  origin: string,
  destination: string,
  originStopId?: string,
  destinationStopId?: string,
  resultLimit = 5,
  selectedMode: RouteMode = 'train'
) {
  const dmType = originStopId ? 'stop' : 'any';
  const dmName = originStopId || origin;
  const apiUrl = `https://api.transport.nsw.gov.au/v1/tp/departure_mon?outputFormat=rapidJSON&coordOutputFormat=EPSG%3A4326&mode=direct&type_dm=${dmType}&name_dm=${encodeURIComponent(dmName)}&departureMonitorMacro=true&TfNSWDM=true&version=10.2.1.42`;

  const response = await fetchWithTimeout(apiUrl, { headers: { 'Authorization': `apikey ${apiKey}` } });
  if (!response.ok) {
    return { statusCode: 200, body: JSON.stringify([]) };
  }

  const data = (await response.json()) as Record<string, unknown>;
  const departures: TrainDeparture[] = [];
  const events = ((data?.stopEvents || []) as Array<Record<string, unknown>>);

  for (const stopEvent of events.slice(0, Math.max(resultLimit + 20, 30))) {
    const transportation = (stopEvent.transportation || {}) as Record<string, unknown>;
    const line = (transportation.disassembledName || transportation.number || '') as string;
    const transportDest = (transportation.destination || {}) as Record<string, unknown>;
    if (!stopEventServesDestination(stopEvent, destination, destinationStopId)) continue;

    const scheduledTime = (stopEvent.departureTimePlanned as string) || '';
    const estimatedTime = (stopEvent.departureTimeEstimated as string) || undefined;
    const location = (stopEvent.location || {}) as Record<string, unknown>;
    const locationProps = (location.properties || {}) as Record<string, string>;
    const platform = locationProps.platform || '';
    const isCancelled = stopEvent.isCancelled === true;

    const product = (transportation.product || {}) as Record<string, unknown>;
    const productClass = product.class as number || 0;
    const productName = (product.name as string) || '';
    const transportType = detectTransportType(productClass, productName, line);
    if (!modeMatches(transportType, selectedMode)) continue;
    const { status, delayMinutes } = getTimingStatus(scheduledTime, estimatedTime, isCancelled);

    departures.push({
      tripId: (transportation.id as string) || `trip-${departures.length}`,
      route: line,
      destination: String(transportDest.name || destination),
      platform,
      scheduledTime,
      estimatedTime,
      status,
      delayMinutes,
      cancelled: isCancelled,
      transportType,
      occupancy: parseOccupancy(stopEvent),
      alerts: parseServiceAlerts((stopEvent.infos || []) as Array<Record<string, unknown>>),
      fareEstimate: estimateFare(originStopId || '', destinationStopId || '', scheduledTime),
    });
  }

  departures.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
  return { statusCode: 200, body: JSON.stringify(departures.slice(0, resultLimit)) };
}

export { handler };
