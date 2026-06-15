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

interface ApiRecord {
  [key: string]: unknown;
}

const NSW_TIME_ZONE = 'Australia/Sydney';

function getSydneyDateParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: NSW_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23',
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
}

/**
 * Trip Stops endpoint — returns the full stop sequence for a specific service.
 * Uses the Trip Planner API with origin/destination to get stopSequence
 * from the matching journey leg.
 */
const handler: Handler = async (event) => {
  const corsResp = handleCors(event.httpMethod);
  if (corsResp) return corsResp;

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const origin = event.queryStringParameters?.origin || '';
  const destination = event.queryStringParameters?.destination || '';
  const originStopId = event.queryStringParameters?.originStopId || '';
  const destinationStopId = event.queryStringParameters?.destinationStopId || '';
  const scheduledTime = event.queryStringParameters?.scheduledTime || '';
  const tripId = event.queryStringParameters?.tripId || '';
  const route = event.queryStringParameters?.route || '';

  if (!origin || !destination) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'origin and destination required' }),
    };
  }

  const apiKey = process.env.TFN_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ stops: [] }),
    };
  }

  try {
    let resolvedOriginId = originStopId;
    let resolvedDestId = destinationStopId;

    if (!resolvedOriginId) {
      resolvedOriginId = await resolveStop(apiKey, origin);
    }

    if (!resolvedDestId) {
      resolvedDestId = await resolveStop(apiKey, destination);
    }

    const originType = resolvedOriginId ? 'stop' : 'any';
    const originName = resolvedOriginId || origin;

    const destType = resolvedDestId ? 'stop' : 'any';
    const destName = resolvedDestId || destination;

    const timeParams = buildTripTimeParams(scheduledTime);

    const url =
      `https://api.transport.nsw.gov.au/v1/tp/trip` +
      `?outputFormat=rapidJSON` +
      `&coordOutputFormat=EPSG%3A4326` +
      `&depArrMacro=dep` +
      `&type_origin=${originType}` +
      `&name_origin=${encodeURIComponent(originName)}` +
      `&type_destination=${destType}` +
      `&name_destination=${encodeURIComponent(destName)}` +
      `&calcNumberOfTrips=8` +
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

    if (!res.ok) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ stops: [] }),
      };
    }

    const data = (await res.json()) as ApiRecord;
    const journeys = (data.journeys || []) as ApiRecord[];

    if (journeys.length === 0) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ stops: [] }),
      };
    }

    const bestLeg = findBestMatchingLeg(journeys, {
      tripId,
      route,
      scheduledTime,
    });

    if (!bestLeg) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ stops: [] }),
      };
    }

    const stopSequence = (bestLeg.stopSequence || []) as ApiRecord[];
    const transportation = (bestLeg.transportation || {}) as ApiRecord;
    const transportDest = (transportation.destination || {}) as ApiRecord;
    const lineName = String(transportation.disassembledName || transportation.number || '');

    const stops = buildStops(stopSequence);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        route: lineName,
        destination: String(transportDest.name || destination).replace(/,.*$/, ''),
        stops,
      }),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';

    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Failed to get trip stops',
        detail: msg,
      }),
    };
  }
};

function buildTripTimeParams(scheduledTime: string): string {
  if (!scheduledTime) return '';

  const d = new Date(scheduledTime);

  if (Number.isNaN(d.getTime())) {
    return '';
  }

  const parts = getSydneyDateParts(d);

  return `&itdDate=${parts.year}${parts.month}${parts.day}&itdTime=${parts.hour}${parts.minute}`;
}

function findBestMatchingLeg(
  journeys: ApiRecord[],
  options: {
    tripId: string;
    route: string;
    scheduledTime: string;
  }
): ApiRecord | null {
  let bestLeg: ApiRecord | null = null;
  let bestScore = -1;

  for (const journey of journeys) {
    const legs = (journey.legs || []) as ApiRecord[];

    for (const leg of legs) {
      const transportation = (leg.transportation || {}) as ApiRecord;
      const product = (transportation.product || {}) as ApiRecord;

      if (Number(product.class) === 100) {
        continue;
      }

      const legTripId = String(transportation.id || '');
      const legRoute = String(transportation.disassembledName || transportation.number || '');

      const originInfo = (leg.origin || {}) as ApiRecord;
      const legDepTime = String(originInfo.departureTimePlanned || '');

      let score = 0;

      if (options.tripId && legTripId === options.tripId) {
        score += 100;
      }

      if (options.route && legRoute === options.route) {
        score += 30;
      }

      if (options.scheduledTime && legDepTime) {
        const expectedMs = new Date(options.scheduledTime).getTime();
        const legMs = new Date(legDepTime).getTime();

        if (!Number.isNaN(expectedMs) && !Number.isNaN(legMs)) {
          const diff = Math.abs(legMs - expectedMs);

          if (diff < 60_000) score += 50;
          else if (diff < 300_000) score += 20;
          else if (diff < 900_000) score += 5;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestLeg = leg;
      }
    }
  }

  if (bestLeg) return bestLeg;

  for (const journey of journeys) {
    const legs = (journey.legs || []) as ApiRecord[];

    for (const leg of legs) {
      const transportation = (leg.transportation || {}) as ApiRecord;
      const product = (transportation.product || {}) as ApiRecord;

      if (Number(product.class) !== 100) {
        return leg;
      }
    }
  }

  return null;
}

function buildStops(stopSequence: ApiRecord[]): StopInfo[] {
  const nowMs = Date.now();

  const stops: StopInfo[] = stopSequence
    .map((stop) => {
      const parent = (stop.parent || {}) as ApiRecord;

      const name = String(parent.name || stop.name || '').replace(/,.*$/, '');

      const arrTime =
        String(stop.arrivalTimeEstimated || stop.arrivalTimePlanned || '') || undefined;

      const depTime =
        String(stop.departureTimeEstimated || stop.departureTimePlanned || '') || undefined;

      if (!name || (!arrTime && !depTime)) {
        return null;
      }

      const platform = extractCleanPlatform(stop);

      const relevantTime = depTime || arrTime;
      const stopMs = relevantTime ? new Date(relevantTime).getTime() : 0;

      const isValidTime = stopMs > 0 && !Number.isNaN(stopMs);
      const isPassed = isValidTime && stopMs < nowMs;

      return {
        name,
        arrivalTime: arrTime,
        departureTime: depTime,
        platform: platform || undefined,
        isPassed,
        isCurrent: false,
      };
    })
    .filter((stop): stop is NonNullable<typeof stop> => stop !== null) as StopInfo[];

  const firstFutureIndex = stops.findIndex((stop) => !stop.isPassed);

  if (firstFutureIndex >= 0) {
    stops[firstFutureIndex].isCurrent = true;
  }

  return stops;
}

function extractCleanPlatform(stop: ApiRecord): string {
  const props = (stop.properties || {}) as Record<string, string>;

  const platformName = props.plannedPlatformName || props.platformName || '';
  if (platformName) {
    const match = platformName.match(/(\d+|[A-Z])$/i);
    return match ? match[1] : '';
  }

  const stoppingPoint = props.stoppingPointPlanned || '';
  if (stoppingPoint) {
    const match = stoppingPoint.match(/(\d+|[A-Z])$/i);
    return match ? match[1] : '';
  }

  const disassembled = String(stop.disassembledName || '');
  const platformMatch = disassembled.match(/[Pp]latform\s*(\d+|[A-Z])/);

  if (platformMatch) {
    return platformMatch[1];
  }

  const area = props.area || '';
  if (area && /^\d+$/.test(area) && Number(area) > 0 && Number(area) <= 30) {
    return area;
  }

  return '';
}

async function resolveStop(apiKey: string, name: string): Promise<string> {
  try {
    const url =
      `https://api.transport.nsw.gov.au/v1/tp/stop_finder` +
      `?outputFormat=rapidJSON` +
      `&type_sf=any` +
      `&name_sf=${encodeURIComponent(name)}` +
      `&coordOutputFormat=EPSG%3A4326` +
      `&TfNSWSF=true` +
      `&version=10.2.1.42`;

    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          Authorization: `apikey ${apiKey}`,
        },
      },
      8000
    );

    if (!res.ok) return '';

    const data = (await res.json()) as ApiRecord;
    const locations = (data.locations || []) as ApiRecord[];

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

export { handler };