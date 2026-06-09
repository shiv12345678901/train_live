import type { Handler } from '@netlify/functions';

interface StopInfo {
  name: string;
  arrivalTime?: string;
  departureTime?: string;
  platform?: string;
  isCurrent?: boolean;
  isPassed?: boolean;
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const origin = event.queryStringParameters?.origin || '';
  const destination = event.queryStringParameters?.destination || '';
  const originStopId = event.queryStringParameters?.originStopId || '';
  const scheduledTime = event.queryStringParameters?.scheduledTime || '';

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
      const sfRes = await fetch(sfUrl, { headers: { 'Authorization': `apikey ${apiKey}` } });
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

    const dmRes = await fetch(dmUrl, { headers: { 'Authorization': `apikey ${apiKey}` } });
    if (!dmRes.ok) {
      return { statusCode: 200, body: JSON.stringify({ stops: [] }) };
    }

    const dmData = (await dmRes.json()) as Record<string, unknown>;
    const stopEvents = (dmData?.stopEvents || []) as Array<Record<string, unknown>>;

    // Find the matching departure by scheduled time
    let matchedEvent: Record<string, unknown> | null = null;

    for (const evt of stopEvents) {
      const depPlanned = evt.departureTimePlanned as string || '';
      if (scheduledTime && depPlanned) {
        // Match by time (within 2 minutes)
        const evtTime = new Date(depPlanned).getTime();
        const targetTime = new Date(scheduledTime).getTime();
        if (Math.abs(evtTime - targetTime) < 120000) {
          matchedEvent = evt;
          break;
        }
      }
    }

    // If no exact match, use first event
    if (!matchedEvent && stopEvents.length > 0) {
      matchedEvent = stopEvents[0];
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
