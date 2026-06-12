/**
 * CORS headers for local development (Vite on different port than Netlify CLI).
 * In production on Netlify, same-origin requests don't need CORS.
 */

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

/**
 * Returns a 204 response for OPTIONS preflight requests.
 * Use at the top of every handler.
 */
export function handleCors(httpMethod: string) {
  if (httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  return null;
}
