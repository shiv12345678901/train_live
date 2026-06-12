import { handleCors, CORS_HEADERS } from '../../lib/cors';
import type { Handler } from '@netlify/functions';
import { fetchWithTimeout } from '../../lib/http';

interface StopInfo {
  name: string;
  arrivalTime?: string;
  departureTime?: string;
  platform?: string;
  isCurrent?: boolean;
  isPassed?: boolean;
}

function idsMatch(value: unknown, targetId: string): boolean {
  return typeof value === 'string' && value === targetId;
}

function stopMatches(stop: Record<string, unknown>, targetName: string, targetStopId?: string): boolean {
  const parent = (stop.parent || {}) as Record<string, unknown>;
  if (targetStopId && (idsMatch(stop.id, targetStopId) || idsMatch(parent.id, targetStopId))) {
    return true;
  }

  const target = targetName.toLowerCase().replace(/\s*station\s*/gi, '').trim();
  const stopName = String(stop.name || '').toLowerCase().replace(/\s*station\s*/gi, '').trim();
  const parentName = String(parent.name || '').toLowerCase().replace(/\s*station\s*/gi, '').trim();
  return Boolean(target && (stopName.includes(target) || parentName.includes(target)));
}

function eventServesDestination(
  stopEvent: Record<string, unknown>,
  destination: string,
  destinationStopId?: string
): boolean {
  const onwardLocations = (stopEvent.onwardLocations || []) as Array<Record<string, unknown>>;
  if (onwardLocations.some((loc) => stopMatches(loc, destination, destinationStopId))) {
    return true;
  }

  const transportation = (stopEvent.transportation || {}) as Record<string, unknown>;
  const transportDest = (transportation.destination || {}) as Record<string, unknown>;
  return stopMatches(transportDest, destination, destinationStopId);
}

function eventMatchScore(
  stopEvent: Record<string, unknown>,
  scheduledTime: string,
  tripId: string,
  platform: string,
  route: string
): number {
  const transportation = (stopEvent.transportation || {}) as Record<string, unknown>;
  const location = (stopEvent.location || {}) as Record<string, unknown>;
  const locationProps = (location.properties || {}) as Record<string, string>;

  let score = 0;
  const eventTripId = String(transportation.id || '');
  if (tripId && eventTripId === tripId) score += 100;

  const eventRoute = String(transportation.disassembledName || transportation.number || '');
  if (route && eventRoute === route) score += 20;

  const eventPlatform = locationProps.platform || '';
  if (platform && eventPlatform && eventPlatform === platform) score += 15;

  const depPlanned = String(stopEvent.departureTimePlanned || '');
  if (scheduledTime && depPlanned) {
    const diff = Math.abs(new Date(depPlanned).getTime() - new Date(scheduledTime).getTime());
    if (diff < 120000) score += 40;
    else if (diff < 600000) score += 10;
  }

  return score;
}

const handler: Handler = async (event) => {
  const corsResp = handleCors(event.httpMethod); if (corsResp) return corsResp;
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const origin = event.queryStringParameters?.origin || '';
  const destination = event.queryStringParameters?.destination || '';
  const originStopId = event.queryStringParameters?.originStopId || '';
  const destinationStopId = event.queryStringParameters?.destinationStopId || '';
  const scheduledTime = event.queryStringParameters?.scheduledTime || '';
  const tripId = event.queryStringParameters?.tripId || '';
  const platform = event.queryStringParameters?.platform || '';
  const route = event.queryStringParameters?.route || '';

  if (!origin) {
    return { statusCode: 400, body: JSON.stringify({ error: 'origin required' }) };
  }

  const apiKey = process.env.TFN_API_KEY;
  if (!apiKey) {
    return { statusCode: 200, body: JSON.stringify({ stops: [] }) };
  }

  try {
    // Resolve stop ID if not provided
    let stopId = originStopId;
    if (!stopId) {
      const sfUrl = `https://api.transport.nsw.gov.au/v1/tp/stop_finder?outputFormat=rapidJSON&type_sf=any&name_sf=${encodeURIComponent(origin)}&TfNSWSF=true&version=10.2.1.42`;
      const sfRes = await fetchWithTimeout(sfUrl, { headers: { 'Authorization': `apikey ${apiKey}` } });
      if (sfRes.ok) {
        const sfData = (await sfRes.json()) as Record<string, unknown>;
        const locations = (sfData?.locations || []) as Array<Record<string, unknown>>;
        for (const loc of locations) {
          if (loc.isGlobalId && loc.type === 'stop') {
            stopId = loc.id as string;
            break;
          }
        }
      }
    }

    if (!stopId) {
      return { statusCode: 200, body: JSON.stringify({ stops: [], error: 'Could not resolve stop' }) };
    }

    // Use departure monitor with stopSequence included
    // The key parameter is &TfNSWDM=true which returns previous/onward calls
    const dmUrl = `https://api.transport.nsw.gov.au/v1/tp/departure_mon?outputFormat=rapidJSON&coordOutputFormat=EPSG%3A4326&mode=direct&type_dm=stop&name_dm=${stopId}&departureMonitorMacro=true&TfNSWDM=true&version=10.2.1.42`;

    const dmRes = await fetchWithTimeout(dmUrl, { headers: { 'Authorization': `apikey ${apiKey}` } });
    if (!dmRes.ok) {
      return { statusCode: 200, body: JSON.stringify({ stops: [] }) };
    }

    const dmData = (await dmRes.json()) as Record<string, unknown>;
    const stopEvents = (dmData?.stopEvents || []) as Array<Record<string, unknown>>;

    let matchedEvent: Record<string, unknown> | null = null;
    let bestScore = 0;

    for (const evt of stopEvents) {
      if (destination && !eventServesDestination(evt, destination, destinationStopId)) continue;
      const score = eventMatchScore(evt, scheduledTime, tripId, platform, route);
      if (score > bestScore) {
        bestScore = score;
        matchedEvent = evt;
      }
    }

    if (!matchedEvent && !scheduledTime && stopEvents.length > 0) {
      matchedEvent = destination
        ? stopEvents.find((evt) => eventServesDestination(evt, destination, destinationStopId)) || null
        : stopEvents[0];
    }

    if (!matchedEvent) {
      return { statusCode: 200, body: JSON.stringify({ stops: [] }) };
    }

    const transportation = (matchedEvent.transportation || {}) as Record<string, unknown>;
    const line = (transportation.disassembledName || transportation.number || '') as string;
    const destInfo = (transportation.destination || {}) as Record<string, string>;

    // Get previous and onward stops from the event
    const previousLocations = (matchedEvent.previousLocations || []) as Array<Record<string, unknown>>;
    const onwardLocations = (matchedEvent.onwardLocations || []) as Array<Record<string, unknown>>;

    const now = new Date();
    const stops: StopInfo[] = [];

    // Previous stops (already passed)
    for (const loc of previousLocations) {
      const parent = (loc.parent || {}) as Record<string, string>;
      const name = parent.name || (loc.name as string) || '';
      const arrTime = (loc.arrivalTimePlanned as string) || (loc.departureTimePlanned as string) || undefined;
      const depTime = (loc.departureTimePlanned as string) || undefined;
      
      stops.push({
        name,
        arrivalTime: arrTime,
        departureTime: depTime,
        isPassed: true,
        isCurrent: false,
      });
    }

    // Current stop (the origin)
    const currentLocation = (matchedEvent.location || {}) as Record<string, unknown>;
    const currentParent = (currentLocation.parent || {}) as Record<string, string>;
    const currentName = currentParent.name || (currentLocation.name as string) || origin;
    const locationProps = (currentLocation.properties || {}) as Record<string, string>;
    const currentPlatform = locationProps.platform || '';

    stops.push({
      name: currentName,
      departureTime: (matchedEvent.departureTimePlanned as string) || undefined,
      platform: currentPlatform,
      isPassed: false,
      isCurrent: true,
    });

    // Onward stops (future)
    for (const loc of onwardLocations) {
      const parent = (loc.parent || {}) as Record<string, string>;
      const name = parent.name || (loc.name as string) || '';
      const arrTime = (loc.arrivalTimePlanned as string) || (loc.departureTimePlanned as string) || undefined;
      const depTime = (loc.departureTimePlanned as string) || undefined;
      const isPassed = arrTime ? new Date(arrTime).getTime() < now.getTime() : false;
      
      stops.push({
        name,
        arrivalTime: arrTime,
        departureTime: depTime,
        isPassed,
        isCurrent: false,
      });

      if (destination && stopMatches(loc, destination, destinationStopId)) {
        break;
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        route: line,
        destination: destInfo.name || destination,
        stops,
      }),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed', detail: msg }) };
  }
};

export { handler };
