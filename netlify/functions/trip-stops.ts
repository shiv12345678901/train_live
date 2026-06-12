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

/**
 * Trip Stops endpoint — returns the full stop sequence for a specific service.
 * Uses the Trip Planner API with origin/destination to get the stopSequence
 * from the matching journey leg.
 */
const handler: Handler = async (event) => {
  const corsResp = handleCors(event.httpMethod); if (corsResp) return corsResp;
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const origin = event.queryStringParameters?.origin || '';
  const destination = event.queryStringParameters?.destination || '';
  const originStopId = event.queryStringParameters?.originStopId || '';
  const destinationStopId = event.queryStringParameters?.destinationStopId || '';
  const scheduledTime = event.queryStringParameters?.scheduledTime || '';
  const tripId = event.queryStringParameters?.tripId || '';
  const route = event.queryStringParameters?.route || '';

  if (!origin || !destination) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'origin and destination required' }) };
  }

  const apiKey = process.env.TFN_API_KEY;
  if (!apiKey) {
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ stops: [] }) };
  }

  try {
    // Resolve origin stop ID if not provided
    let resolvedOriginId = originStopId;
    let resolvedDestId = destinationStopId;

    if (!resolvedOriginId) {
      resolvedOriginId = await resolveStop(apiKey, origin);
    }
    if (!resolvedDestId) {
      resolvedDestId = await resolveStop(apiKey, destination);
    }

    // Use Trip Planner to get the journey with stopSequence
    const originType = resolvedOriginId ? 'stop' : 'any';
    const originName = resolvedOriginId || origin;
    const destType = resolvedDestId ? 'stop' : 'any';
    const destName = resolvedDestId || destination;

    // Request specific departure time if available
    let timeParams = '';
    if (scheduledTime) {
      const d = new Date(scheduledTime);
      const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const timeStr = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
      timeParams = `&itdDate=${dateStr}&itdTime=${timeStr}`;
    }

    const url = `https://api.transport.nsw.gov.au/v1/tp/trip?outputFormat=rapidJSON&coordOutputFormat=EPSG%3A4326&depArrMacro=dep&type_origin=${originType}&name_origin=${encodeURIComponent(originName)}&type_destination=${destType}&name_destination=${encodeURIComponent(destName)}&calcNumberOfTrips=5&TfNSWTR=true&version=10.2.1.42${timeParams}`;

    const res = await fetchWithTimeout(url, { headers: { 'Authorization': `apikey ${apiKey}` } }, 15000);
    if (!res.ok) {
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ stops: [] }) };
    }

    const data = (await res.json()) as Record<string, unknown>;
    const journeys = (data?.journeys || []) as Array<Record<string, unknown>>;

    if (journeys.length === 0) {
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ stops: [] }) };
    }

    // Find the best matching journey/leg
    let bestLeg: Record<string, unknown> | null = null;
    let bestScore = -1;

    for (const journey of journeys) {
      const legs = (journey.legs || []) as Array<Record<string, unknown>>;
      for (const leg of legs) {
        const t = (leg.transportation || {}) as Record<string, unknown>;
        const p = (t.product || {}) as Record<string, unknown>;
        if (Number(p.class) === 100) continue; // skip walking

        let score = 0;
        const legTripId = String(t.id || '');
        const legRoute = String(t.disassembledName || t.number || '');
        const legOrigin = (leg.origin || {}) as Record<string, unknown>;
        const legDepTime = String(legOrigin.departureTimePlanned || '');

        if (tripId && legTripId === tripId) score += 100;
        if (route && legRoute === route) score += 30;
        if (scheduledTime && legDepTime) {
          const diff = Math.abs(new Date(legDepTime).getTime() - new Date(scheduledTime).getTime());
          if (diff < 60000) score += 50;
          else if (diff < 300000) score += 20;
          else if (diff < 900000) score += 5;
        }

        if (score > bestScore) {
          bestScore = score;
          bestLeg = leg;
        }
      }
    }

    // Fallback: use first transit leg of first journey
    if (!bestLeg) {
      for (const journey of journeys) {
        const legs = (journey.legs || []) as Array<Record<string, unknown>>;
        for (const leg of legs) {
          const t = (leg.transportation || {}) as Record<string, unknown>;
          const p = (t.product || {}) as Record<string, unknown>;
          if (Number(p.class) !== 100) {
            bestLeg = leg;
            break;
          }
        }
        if (bestLeg) break;
      }
    }

    if (!bestLeg) {
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ stops: [] }) };
    }

    // Extract stop sequence from the leg
    const stopSequence = (bestLeg.stopSequence || []) as Array<Record<string, unknown>>;
    const transportation = (bestLeg.transportation || {}) as Record<string, unknown>;
    const transportDest = (transportation.destination || {}) as Record<string, unknown>;
    const lineName = String(transportation.disassembledName || transportation.number || '');

    const now = new Date();
    const stops: StopInfo[] = [];

    for (const stop of stopSequence) {
      const parent = (stop.parent || {}) as Record<string, unknown>;
      const name = String(parent.name || stop.name || '');
      const arrTime = (stop.arrivalTimePlanned as string) || (stop.arrivalTimeEstimated as string) || undefined;
      const depTime = (stop.departureTimePlanned as string) || (stop.departureTimeEstimated as string) || undefined;

      // Skip stops without any time — train doesn't stop here (express)
      if (!arrTime && !depTime) continue;

      const props = (stop.properties || {}) as Record<string, string>;
      
      // Extract clean platform number (not coded IDs like "ROK2")
      let platform = '';
      const platformName = props.plannedPlatformName || props.platformName || '';
      if (platformName) {
        const m = platformName.match(/(\d+|[A-Z])$/i);
        platform = m ? m[1] : '';
      } else if (props.stoppingPointPlanned) {
        const m = props.stoppingPointPlanned.match(/(\d+|[A-Z])$/i);
        platform = m ? m[1] : '';
      } else {
        // Try from disassembledName
        const dis = String(stop.disassembledName || '');
        const m = dis.match(/[Pp]latform\s*(\d+|[A-Z])/);
        platform = m ? m[1] : '';
      }

      // Determine if this stop is passed or current
      const relevantTime = depTime || arrTime;
      const stopTime = relevantTime ? new Date(relevantTime).getTime() : 0;
      const isPassed = stopTime > 0 && stopTime < now.getTime();

      // Check if this is approximately the "current" stop (closest future stop)
      const isCurrent = stopTime > 0 &&
        stopTime >= now.getTime() &&
        stopTime < now.getTime() + 120000; // within 2 min of now

      stops.push({
        name,
        arrivalTime: arrTime,
        departureTime: depTime,
        platform: platform || undefined,
        isPassed,
        isCurrent,
      });
    }

    // If no stop was marked current, mark the first future stop
    if (!stops.some(s => s.isCurrent)) {
      const firstFuture = stops.find(s => !s.isPassed);
      if (firstFuture) firstFuture.isCurrent = true;
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        route: lineName,
        destination: String(transportDest.name || destination),
        stops,
      }),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Failed to get trip stops', detail: msg }) };
  }
};

async function resolveStop(apiKey: string, name: string): Promise<string> {
  try {
    const url = `https://api.transport.nsw.gov.au/v1/tp/stop_finder?outputFormat=rapidJSON&type_sf=any&name_sf=${encodeURIComponent(name)}&TfNSWSF=true&version=10.2.1.42`;
    const res = await fetchWithTimeout(url, { headers: { 'Authorization': `apikey ${apiKey}` } }, 8000);
    if (!res.ok) return '';
    const data = (await res.json()) as Record<string, unknown>;
    const locs = (data?.locations || []) as Array<Record<string, unknown>>;
    for (const loc of locs) {
      if (loc.isGlobalId && loc.type === 'stop') return String(loc.id || '');
    }
  } catch { /* ignore */ }
  return '';
}

export { handler };
