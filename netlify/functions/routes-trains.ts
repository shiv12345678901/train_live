import type { Handler } from '@netlify/functions';

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
    let origin = event.queryStringParameters?.origin || '';
    let destination = event.queryStringParameters?.destination || '';
    const originStopId = event.queryStringParameters?.originStopId || '';

    if (!origin || !destination) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Origin and destination query params are required' }) };
    }

    const apiKey = process.env.TFN_API_KEY;
    if (!apiKey) {
      return { statusCode: 200, body: JSON.stringify([]) };
    }

    // Use stop ID if available, otherwise try to resolve station name
    let dmName = originStopId || '';
    let dmType = 'stop';
    
    if (!dmName) {
      // Try resolving the station name to an ID via stop finder
      const sfUrl = `https://api.transport.nsw.gov.au/v1/tp/stop_finder?outputFormat=rapidJSON&type_sf=any&name_sf=${encodeURIComponent(origin)}&coordOutputFormat=EPSG%3A4326&TfNSWSF=true&version=10.2.1.42`;
      try {
        const sfRes = await fetch(sfUrl, { headers: { 'Authorization': `apikey ${apiKey}` } });
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

    // Departure monitor
    const dmUrl = `https://api.transport.nsw.gov.au/v1/tp/departure_mon?outputFormat=rapidJSON&coordOutputFormat=EPSG%3A4326&mode=direct&type_dm=${dmType}&name_dm=${encodeURIComponent(dmName)}&departureMonitorMacro=true&TfNSWDM=true&version=10.2.1.42`;

    const dmResponse = await fetch(dmUrl, {
      headers: { 'Authorization': `apikey ${apiKey}` },
    });

    if (dmResponse.ok) {
      const dmData = (await dmResponse.json()) as Record<string, unknown>;
      const events = ((dmData?.stopEvents || []) as Array<Record<string, unknown>>);

      if (events.length > 0) {
        const departures: TrainDeparture[] = [];
        const destLower = destination.toLowerCase().replace(/\s*station\s*/gi, '').trim();

        for (const stopEvent of events.slice(0, 40)) {
          const transportation = (stopEvent.transportation || {}) as Record<string, unknown>;
          const line = (transportation.disassembledName || transportation.number || '') as string;
          const product = (transportation.product || {}) as Record<string, unknown>;
          const productClass = product.class as number || 0;
          
          // Determine transport type from product class
          // TfNSW classes: 1=train, 2=metro, 5=bus, 4=light rail, 9=ferry
          let transportType: TrainDeparture['transportType'] = 'train';
          if (productClass === 5 || productClass === 7) transportType = 'bus';
          else if (productClass === 2) transportType = 'metro';
          else if (productClass === 4) transportType = 'light_rail';
          else if (productClass === 9) transportType = 'ferry';

          // Get the train's final destination name
          const transportDest = (transportation.destination || {}) as Record<string, string>;
          const destStop = (transportDest.name || '').toLowerCase();
          
          // Accept train if:
          // 1. Its destination contains our target (exact match)
          // 2. Its destination route goes "via" our target
          // 3. Our target is a major city station and train goes toward the city
          //    (trains to Bondi Junction, City, Central all stop at Redfern)
          const destContainsTarget = destStop.includes(destLower) || destLower.includes(destStop.replace(/\s*station\s*/gi, '').trim());
          const viaTarget = destStop.includes('via') && destStop.includes(destLower);
          
          // City-bound heuristic: if user wants Redfern/Central/Town Hall etc,
          // accept any train heading cityward (Bondi Junction, Central, City Circle stations)
          const cityStations = ['central', 'town hall', 'wynyard', 'circular quay', 'martin place', 'st james', 'museum', 'redfern', 'bondi junction', 'kings cross', 'edgecliff'];
          const targetIsCity = cityStations.some(s => destLower.includes(s));
          const trainGoesCity = cityStations.some(s => destStop.includes(s));
          const cityMatch = targetIsCity && trainGoesCity;

          if (!destContainsTarget && !viaTarget && !cityMatch) continue;

          const scheduledTime = (stopEvent.departureTimePlanned as string) || '';
          const estimatedTime = (stopEvent.departureTimeEstimated as string) || undefined;
          const location = (stopEvent.location || {}) as Record<string, unknown>;
          const locationProps = (location.properties || {}) as Record<string, string>;
          const platform = locationProps.platform || '';
          const isCancelled = stopEvent.isCancelled === true;

          let status: TrainDeparture['status'] = 'unknown';
          let delayMinutes: number | undefined;

          if (isCancelled) {
            status = 'cancelled';
          } else if (estimatedTime && scheduledTime) {
            const diff = (new Date(estimatedTime).getTime() - new Date(scheduledTime).getTime()) / 60000;
            if (diff <= 1) status = 'on-time';
            else { status = 'delayed'; delayMinutes = Math.round(diff); }
          } else if (scheduledTime) {
            status = 'on-time';
          }

          departures.push({
            tripId: (transportation.id as string) || `trip-${departures.length}`,
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

        departures.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
        return { statusCode: 200, body: JSON.stringify(departures.slice(0, 5)) };
      }
    }

    // Fallback: try Trip Planner API
    const tripUrl = `https://api.transport.nsw.gov.au/v1/tp/trip?outputFormat=rapidJSON&coordOutputFormat=EPSG%3A4326&depArrMacro=dep&type_origin=any&name_origin=${encodeURIComponent(origin)}&type_destination=any&name_destination=${encodeURIComponent(destination)}&calcNumberOfTrips=6&TfNSWTR=true&version=10.2.1.42`;

    const tripResponse = await fetch(tripUrl, {
      headers: { 'Authorization': `apikey ${apiKey}` },
    });

    if (!tripResponse.ok) {
      // Fallback to departure monitor
      return await fallbackDepartureMon(apiKey, origin, destination);
    }

    const tripData = (await tripResponse.json()) as Record<string, unknown>;
    const journeys = (tripData?.journeys || []) as Array<Record<string, unknown>>;

    const departures: TrainDeparture[] = [];

    for (const journey of journeys) {
      const legs = (journey.legs || []) as Array<Record<string, unknown>>;
      if (legs.length !== 1) continue; // Direct services only

      const leg = legs[0];
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

      // Check stop sequence includes destination
      const stopSequence = (leg.stopSequence || []) as Array<Record<string, unknown>>;
      if (stopSequence.length > 0) {
        const destLower = destination.toLowerCase();
        const stopsAtDest = stopSequence.some((stop) => {
          const stopName = ((stop.name as string) || '').toLowerCase();
          const stopParent = ((stop.parent || {}) as Record<string, string>).name || '';
          return stopName.includes(destLower) || stopParent.toLowerCase().includes(destLower);
        });
        if (!stopsAtDest) continue;
      }

      let status: TrainDeparture['status'] = 'unknown';
      let delayMinutes: number | undefined;

      if (isCancelled) {
        status = 'cancelled';
      } else if (estimatedTime && scheduledTime) {
        const diff = (new Date(estimatedTime).getTime() - new Date(scheduledTime).getTime()) / 60000;
        if (diff <= 1) {
          status = 'on-time';
        } else {
          status = 'delayed';
          delayMinutes = Math.round(diff);
        }
      } else if (scheduledTime) {
        status = 'on-time';
      }

      departures.push({ tripId, route: line, platform, scheduledTime, estimatedTime, status, delayMinutes, cancelled: isCancelled, transportType: 'train', alerts: [] });
    }

    departures.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
    return { statusCode: 200, body: JSON.stringify(departures.slice(0, 5)) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch live trains', detail: msg }) };
  }
};

async function fallbackDepartureMon(apiKey: string, origin: string, destination: string) {
  const apiUrl = `https://api.transport.nsw.gov.au/v1/tp/departure_mon?outputFormat=rapidJSON&coordOutputFormat=EPSG%3A4326&mode=direct&type_dm=stop&name_dm=${encodeURIComponent(origin)}&departureMonitorMacro=true&TfNSWDM=true&version=10.2.1.42`;

  const response = await fetch(apiUrl, { headers: { 'Authorization': `apikey ${apiKey}` } });
  if (!response.ok) {
    return { statusCode: 200, body: JSON.stringify([]) };
  }

  const data = (await response.json()) as Record<string, unknown>;
  const departures: TrainDeparture[] = [];
  const events = ((data?.stopEvents || []) as Array<Record<string, unknown>>);

  for (const stopEvent of events.slice(0, 30)) {
    const transportation = (stopEvent.transportation || {}) as Record<string, unknown>;
    const line = (transportation.disassembledName || transportation.number || '') as string;
    const transportDest = (transportation.destination || {}) as Record<string, string>;
    const destStop = transportDest.name || '';
    if (!destStop.toLowerCase().includes(destination.toLowerCase())) continue;

    const scheduledTime = (stopEvent.departureTimePlanned as string) || '';
    const estimatedTime = (stopEvent.departureTimeEstimated as string) || undefined;
    const location = (stopEvent.location || {}) as Record<string, unknown>;
    const locationProps = (location.properties || {}) as Record<string, string>;
    const platform = locationProps.platform || '';
    const isCancelled = stopEvent.isCancelled === true;

    let status: TrainDeparture['status'] = 'unknown';
    let delayMinutes: number | undefined;

    if (isCancelled) {
      status = 'cancelled';
    } else if (estimatedTime && scheduledTime) {
      const diff = (new Date(estimatedTime).getTime() - new Date(scheduledTime).getTime()) / 60000;
      if (diff <= 1) status = 'on-time';
      else { status = 'delayed'; delayMinutes = Math.round(diff); }
    }

    departures.push({ tripId: (transportation.id as string) || `trip-${departures.length}`, route: line, platform, scheduledTime, estimatedTime, status, delayMinutes, cancelled: isCancelled, transportType: 'train', alerts: [] });
  }

  departures.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
  return { statusCode: 200, body: JSON.stringify(departures.slice(0, 5)) };
}

export { handler };
