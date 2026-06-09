import type { Handler } from '@netlify/functions';

interface StopResult {
  id: string;
  name: string;
  type: string; // 'station' | 'platform' | 'bus_stop' etc.
  locality: string;
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const query = event.queryStringParameters?.q;
  if (!query || query.trim().length < 2) {
    return { statusCode: 200, body: JSON.stringify([]) };
  }

  const apiKey = process.env.TFN_API_KEY;
  if (!apiKey) {
    return { statusCode: 200, body: JSON.stringify([]) };
  }

  try {
    // TfNSW Stop Finder API
    const apiUrl = `https://api.transport.nsw.gov.au/v1/tp/stop_finder?outputFormat=rapidJSON&type_sf=any&name_sf=${encodeURIComponent(query.trim())}&coordOutputFormat=EPSG%3A4326&TfNSWSF=true&version=10.2.1.42`;

    const response = await fetch(apiUrl, {
      headers: { 'Authorization': `apikey ${apiKey}` },
    });

    if (!response.ok) {
      return { statusCode: 200, body: JSON.stringify([]) };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const locations = (data?.locations || []) as Array<Record<string, unknown>>;

    const stops: StopResult[] = [];

    for (const loc of locations.slice(0, 15)) {
      const name = (loc.name || loc.disassembledName || '') as string;
      const id = (loc.id || '') as string;
      const typeStr = (loc.type || '') as string;
      const parent = (loc.parent || {}) as Record<string, string>;
      const locality = parent.name || '';

      // Filter to meaningful stop types (stations, platforms, bus stops, ferry wharves)
      const isStop = typeStr === 'stop' || typeStr === 'poi' || typeStr === 'locality';
      // Include all results from the stop finder as they are already filtered
      if (!name) continue;

      // Determine a friendly type label
      let type = 'stop';
      const nameLower = name.toLowerCase();
      if (nameLower.includes('station')) type = 'station';
      else if (nameLower.includes('wharf')) type = 'wharf';
      else if (nameLower.includes('light rail')) type = 'light_rail';
      else if (isStop) type = 'stop';

      stops.push({ id, name, type, locality });
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stops),
    };
  } catch (_error) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to search stops' }) };
  }
};

export { handler };
