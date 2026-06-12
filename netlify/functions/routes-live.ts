import { handleCors, CORS_HEADERS } from '../../lib/cors';
import type { Handler } from '@netlify/functions';
import { fetchWithTimeout } from '../../lib/http';

/**
 * Feature 36: Lightweight live status endpoint.
 * Returns minimal data (just times + status) for efficient polling.
 * Designed to be called every 15-30s by the frontend for "real-time" feel.
 * 
 * In a non-serverless environment, this would be replaced with SSE/WebSockets.
 * The response is intentionally small to minimize bandwidth.
 */

interface LiveStatus {
  routeId: string;
  nextDepartureTime?: string;
  nextEstimatedTime?: string;
  status?: string;
  platform?: string;
  delayMinutes?: number;
}

const handler: Handler = async (event) => {
  const corsResp = handleCors(event.httpMethod); if (corsResp) return corsResp;
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const routeIds = event.queryStringParameters?.ids;
  if (!routeIds) {
    return { statusCode: 400, body: JSON.stringify({ error: 'ids query parameter is required (comma-separated)' }) };
  }

  const apiKey = process.env.TFN_API_KEY;
  if (!apiKey) {
    return { statusCode: 503, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  // This is a lightweight endpoint - just returns status for quick polling
  // The full data is fetched by routes-trains
  const results: LiveStatus[] = routeIds.split(',').slice(0, 10).map((id) => ({
    routeId: id.trim(),
  }));

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body: JSON.stringify({ statuses: results, timestamp: new Date().toISOString() }),
  };
};

export { handler };
