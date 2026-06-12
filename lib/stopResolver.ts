import { fetchWithTimeout } from './http';

/**
 * Shared stop ID resolver. Used by routes-trains and trip-stops.
 * Resolves a station name to its TfNSW global stop ID via the Stop Finder API.
 */
export async function resolveStopId(apiKey: string, stationName: string): Promise<string> {
  try {
    const url = `https://api.transport.nsw.gov.au/v1/tp/stop_finder?outputFormat=rapidJSON&type_sf=any&name_sf=${encodeURIComponent(stationName)}&coordOutputFormat=EPSG%3A4326&TfNSWSF=true&version=10.2.1.42`;
    const res = await fetchWithTimeout(url, { headers: { 'Authorization': `apikey ${apiKey}` } }, 8000);
    if (!res.ok) return '';

    const data = (await res.json()) as Record<string, unknown>;
    const locations = (data?.locations || []) as Array<Record<string, unknown>>;

    for (const loc of locations) {
      if (loc.isGlobalId && loc.type === 'stop') {
        return String(loc.id || '');
      }
    }
    for (const loc of locations) {
      if (loc.type === 'stop' && loc.id) {
        return String(loc.id);
      }
    }
  } catch { /* continue */ }
  return '';
}
