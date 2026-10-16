# Train Live public API

Your personal app can request train data from the deployed Train Live site. The TfNSW key stays on the Netlify server; do not put it in your app.

## Search departures

```http
GET https://sydneytrain.netlify.app/api/v1/trains?origin=Central%20Station&destination=Town%20Hall%20Station&mode=train&limit=5
```

The response is a JSON array of services. Each service includes `tripId`, `route`, `destination`, `platform`, `scheduledTime`, optional `estimatedTime`, `status`, `delayMinutes`, `cancelled`, `transportType`, and `alerts`. Times are ISO 8601 values; display them in `Australia/Sydney` in your app.

| Parameter | Required | Description |
| --- | --- | --- |
| `origin` | Yes | Full stop name, such as `Central Station`. |
| `destination` | Yes | Full stop name, such as `Town Hall Station`. |
| `mode` | No | `train` (default), `metro`, `bus`, `light_rail`, `ferry`, or `all`. |
| `limit` | No | Number of services, from 1 to 50; default 5. |
| `originStopId` | No | TfNSW stop ID to disambiguate the origin. |
| `destinationStopId` | No | TfNSW stop ID to disambiguate the destination. |
| `departureAt` | No | Sydney local departure time in `YYYY-MM-DDTHH:mm` format. Omit for live departures. |

Use full stop names or pass stop IDs. A short name such as `Central` can resolve to another place and return an empty array. Search stop names and IDs with:

```http
GET https://sydneytrain.netlify.app/api/v1/stops?q=Central%20Station
```

Example for a web app:

```js
const params = new URLSearchParams({
  origin: 'Central Station',
  destination: 'Town Hall Station',
  mode: 'train',
  limit: '5',
});
const response = await fetch(`https://sydneytrain.netlify.app/api/v1/trains?${params}`);
if (!response.ok) throw new Error(`Train API returned ${response.status}`);
const trains = await response.json();
```

The endpoint allows cross-origin browser requests. It may return `[]` when no matching service is found, `400` for invalid input, `429` when rate limited, or `503` if the server's TfNSW key is unavailable. Avoid rapid polling; live responses can be cached briefly.

The existing `/.netlify/functions/routes-trains` path remains available for the Train Live web app. Its `id` parameter is no longer required when `origin` and `destination` are supplied.
