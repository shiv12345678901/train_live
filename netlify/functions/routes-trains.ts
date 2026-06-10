import type { Handler } from '@netlify/functions';
import { fetchWithTimeout } from '../../lib/http';
import { detectTransportType, getTimingStatus, matchesDestination } from '../../lib/trainParsing';

interface TrainDeparture {
  tripId: string;
  route: string;
  platform: string;
  scheduledTime: string;
  estimatedTime?: string;
  status: 'on-time' | 'delayed' | 'cancelled' | 'changed' | 'unknown';
  delayMinutes?: number;
  cancelled: boolean;
  transportType: 'train' | 'metro' | 'bus' | 'light_rail' | 'ferry';
  alerts: { id: string; title: string; description: string }[];
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

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
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

          // Get the train's final destination name
          const transportDest = (transportation.destination || {}) as Record<string, unknown>;
          
          // Accept if destination matches target
          if (!serviceMatchesDestination(transportDest, destination, destinationStopId)) continue;

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

          departures.push({
            tripId: tripId || `trip-${departures.length}`,
            route: line,
            platform,
            scheduledTime,
            estimatedTime,
            status,
            delayMinutes,
            cancelled: isCancelled,
            transportType,
            alerts: [],
          });
        }

        if (departures.length > 0) {
          departures.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
          return { statusCode: 200, body: JSON.stringify(departures.slice(0, 30)) };
        }
      }
    }

    // Fallback: try Trip Planner API
    const originType = originStopId ? 'stop' : 'any';
    const originName = originStopId || origin;
    const destinationType = destinationStopId ? 'stop' : 'any';
    const destinationName = destinationStopId || destination;
    const tripUrl = `https://api.transport.nsw.gov.au/v1/tp/trip?outputFormat=rapidJSON&coordOutputFormat=EPSG%3A4326&depArrMacro=dep&type_origin=${originType}&name_origin=${encodeURIComponent(originName)}&type_destination=${destinationType}&name_destination=${encodeURIComponent(destinationName)}&calcNumberOfTrips=6&TfNSWTR=true&version=10.2.1.42`;

    const tripResponse = await fetchWithTimeout(tripUrl, {
      headers: { 'Authorization': `apikey ${apiKey}` },
    });

    if (!tripResponse.ok) {
      // Fallback to departure monitor
      return await fallbackDepartureMon(apiKey, origin, destination, originStopId, destinationStopId);
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
      if (transitLegs.length !== 1) continue; // Direct service, allowing walk/access legs.

      const leg = transitLegs[0];
      const transportation = (leg.transportation || {}) as Record<string, unknown>;
      const product = (transportation.product || {}) as Record<string, unknown>;
      if ((product.class as number) === 100) continue; // Skip walking

      const originInfo = (leg.origin || {}) as Record<string, unknown>;
      const scheduledTime = (originInfo.departureTimePlanned as string) || '';
      const estimatedTime = (originInfo.departureTimeEstimated as string) || undefined;

      const platformRaw = (originInfo.disassembledName as string) || '';
      const platformMatch = platformRaw.match(/(\d+|[A-Z])$/);
      const platform = platformMatch ? platformMatch[1] : '';

      const line = (transportation.disassembledName || transportation.number || '') as string;
      const tripId = (transportation.id as string) || `trip-${departures.length}`;
      const isCancelled = leg.isCancelled === true;

      const stopSequence = (leg.stopSequence || []) as Array<Record<string, unknown>>;
      if (stopSequence.length > 0) {
        const stopsAtDest = stopSequenceContainsDestination(stopSequence, destination, destinationStopId);
        if (!stopsAtDest) continue;
      }

      const { status, delayMinutes } = getTimingStatus(scheduledTime, estimatedTime, isCancelled);

      const productClass = product.class as number || 0;
      const productName = (product.name as string) || '';
      const transportType = detectTransportType(productClass, productName, line);
      const dedupeKey = `${tripId}:${scheduledTime}:${platform}:${transportType}`;
      if (seenTrips.has(dedupeKey)) continue;
      seenTrips.add(dedupeKey);
      departures.push({ tripId, route: line, platform, scheduledTime, estimatedTime, status, delayMinutes, cancelled: isCancelled, transportType, alerts: [] });
    }

    departures.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
    return { statusCode: 200, body: JSON.stringify(departures.slice(0, 30)) };
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
  destinationStopId?: string
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

  for (const stopEvent of events.slice(0, 30)) {
    const transportation = (stopEvent.transportation || {}) as Record<string, unknown>;
    const line = (transportation.disassembledName || transportation.number || '') as string;
    const transportDest = (transportation.destination || {}) as Record<string, unknown>;
    if (!serviceMatchesDestination(transportDest, destination, destinationStopId)) continue;

    const scheduledTime = (stopEvent.departureTimePlanned as string) || '';
    const estimatedTime = (stopEvent.departureTimeEstimated as string) || undefined;
    const location = (stopEvent.location || {}) as Record<string, unknown>;
    const locationProps = (location.properties || {}) as Record<string, string>;
    const platform = locationProps.platform || '';
    const isCancelled = stopEvent.isCancelled === true;

    const product = (transportation.product || {}) as Record<string, unknown>;
    const productClass = product.class as number || 0;
    const productName = (product.name as string) || '';
    const { status, delayMinutes } = getTimingStatus(scheduledTime, estimatedTime, isCancelled);

    departures.push({ tripId: (transportation.id as string) || `trip-${departures.length}`, route: line, platform, scheduledTime, estimatedTime, status, delayMinutes, cancelled: isCancelled, transportType: detectTransportType(productClass, productName, line), alerts: [] });
  }

  departures.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
  return { statusCode: 200, body: JSON.stringify(departures.slice(0, 30)) };
}

export { handler };
