import { useEffect } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';

const BASE = 'https://sydneytrain.netlify.app/api/v1';
const TRAIN_URL = `${BASE}/trains?origin=Central%20Station&destination=Town%20Hall%20Station&mode=train&limit=5`;
const STOPS_URL = `${BASE}/stops?q=Central%20Station`;

const trainFields = [
  ['tripId', 'string', 'Service identifier'],
  ['route', 'string', 'Line or route label, such as T8'],
  ['destination', 'string?', 'Service destination'],
  ['platform', 'string', 'Platform or stand; may be empty'],
  ['scheduledTime', 'string', 'Planned departure, ISO 8601'],
  ['estimatedTime', 'string?', 'Updated departure, ISO 8601 when available'],
  ['status', 'string', 'on-time, delayed, cancelled, changed, or unknown'],
  ['delayMinutes', 'number?', 'Delay in minutes when available'],
  ['cancelled', 'boolean', 'Whether the service is cancelled'],
  ['transportType', 'string', 'train, metro, bus, light_rail, or ferry'],
  ['occupancy', 'string?', 'empty, low, medium, high, full, or unknown'],
  ['alerts', 'array', 'Service notices; each has id, title, description, and optional severity'],
  ['legs', 'array?', 'Trip segments with mode, route, stops, times, and optional platform'],
  ['fareEstimate', 'object?', 'Estimated adultPeak, adultOffPeak, isPeakNow, and currency'],
] as const;

function Code({ children }: { children: string }) {
  return <pre className="api-guide-code"><code>{children}</code></pre>;
}

export function ApiGuidePage() {
  useEffect(() => {
    document.querySelector('.app-main')?.scrollTo(0, 0);
  }, []);

  return (
    <div className="api-guide-page">
      <PageHeader title="API guide" backButton />
      <div className="api-guide-content">
        <p className="api-guide-intro">Fetch the same TfNSW data used by Train Live from your own app. Requests are public GET requests and return JSON. The TfNSW key stays on this server.</p>

        <section className="api-guide-section">
          <h2>1. Live departures</h2>
          <p>Search between two stops. Use full stop names to avoid matches such as “Central Rd” instead of “Central Station”.</p>
          <Code>{TRAIN_URL}</Code>
          <a href={TRAIN_URL} target="_blank" rel="noreferrer">Open example response ↗</a>
          <div className="api-guide-table-wrap">
            <table className="api-guide-table">
              <thead><tr><th>Parameter</th><th>Type</th><th>Details</th></tr></thead>
              <tbody>
                <tr><td><code>origin</code></td><td>string</td><td>Required full stop name</td></tr>
                <tr><td><code>destination</code></td><td>string</td><td>Required full stop name</td></tr>
                <tr><td><code>mode</code></td><td>string</td><td>Optional: train (default), metro, bus, light_rail, ferry, all</td></tr>
                <tr><td><code>limit</code></td><td>integer</td><td>Optional: minimum 1, maximum 50, default 5</td></tr>
                <tr><td><code>originStopId</code></td><td>string</td><td>Optional TfNSW stop ID to identify the origin exactly</td></tr>
                <tr><td><code>destinationStopId</code></td><td>string</td><td>Optional TfNSW stop ID to identify the destination exactly</td></tr>
                <tr><td><code>departureAt</code></td><td>string</td><td>Optional Sydney local date/time: YYYY-MM-DDTHH:mm. Omit for live departures.</td></tr>
              </tbody>
            </table>
          </div>
          <p><strong>Result size:</strong> a JSON array with 0 to <code>limit</code> services. A request for 50 may return fewer when TfNSW has fewer matching services.</p>
        </section>

        <section className="api-guide-section">
          <h2>2. Find stop IDs</h2>
          <p>Search first when a place name is ambiguous, then pass the returned <code>id</code> as <code>originStopId</code> or <code>destinationStopId</code>.</p>
          <Code>{STOPS_URL}</Code>
          <a href={STOPS_URL} target="_blank" rel="noreferrer">Open stop search ↗</a>
          <p><code>q</code> is a string of at least 2 characters. The response is an array of up to 15 matches. Each match has <code>id</code>, <code>name</code>, <code>type</code>, and <code>locality</code> strings. Empty or one-character queries return <code>[]</code>.</p>
        </section>

        <section className="api-guide-section">
          <h2>3. Train response fields</h2>
          <p>Times include a timezone offset. Convert them to <code>Australia/Sydney</code> for display. Fields marked <code>?</code> may be absent; alerts can be an empty array.</p>
          <div className="api-guide-table-wrap">
            <table className="api-guide-table">
              <thead><tr><th>Field</th><th>Type</th><th>Meaning</th></tr></thead>
              <tbody>{trainFields.map(([name, type, meaning]) => <tr key={name}><td><code>{name}</code></td><td>{type}</td><td>{meaning}</td></tr>)}</tbody>
            </table>
          </div>
          <h3>Nested data</h3>
          <p><code>alerts[]</code>: <code>id</code> (string), <code>title</code> (string), <code>description</code> (string), optional <code>severity</code> (info, warning, critical).</p>
          <p><code>legs[]</code>: <code>mode</code>, <code>route</code>, <code>origin</code>, <code>destination</code>, <code>scheduledDeparture</code>, and <code>scheduledArrival</code> are strings; <code>platform</code>, <code>estimatedDeparture</code>, and <code>estimatedArrival</code> may be absent. <code>durationMinutes</code> and <code>stops</code> are numbers; <code>isWalking</code> is an optional boolean.</p>
          <p><code>fareEstimate</code>: <code>adultPeak</code> and <code>adultOffPeak</code> are AUD numbers, <code>isPeakNow</code> and <code>estimated</code> are booleans, and <code>currency</code> is a string. This is a rough estimate, not an official fare quote.</p>
        </section>

        <section className="api-guide-section">
          <h2>4. Call it from your app</h2>
          <Code>{`const params = new URLSearchParams({
  origin: 'Central Station',
  destination: 'Town Hall Station',
  mode: 'train',
  limit: '5',
});
const response = await fetch('${BASE}/trains?' + params);
if (!response.ok) throw new Error('HTTP ' + response.status);
const trains = await response.json();`}</Code>
          <p>For a scheduled search, add <code>departureAt</code> in <code>YYYY-MM-DDTHH:mm</code> format. Use a future Sydney time; timetable availability depends on TfNSW.</p>
        </section>

        <section className="api-guide-section">
          <h2>Limits and errors</h2>
          <p>Browser requests from other sites are allowed by CORS. The train endpoint returns <code>400</code> for missing stops or an invalid date, <code>429</code> when rate limited, <code>503</code> when the server key is unavailable, and <code>500</code> for an upstream failure. Error responses contain an <code>error</code> string. A successful request with no matches returns <code>[]</code>.</p>
          <p>The train function has a best-effort in-memory limit of 60 requests per minute per user/IP key. It is not a guaranteed quota across all server instances. Poll moderately; responses may be cached for about 30 seconds.</p>
        </section>
      </div>
    </div>
  );
}
