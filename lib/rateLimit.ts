/**
 * Simple in-memory rate limiter for serverless functions.
 * Uses a sliding window approach. In production, replace with Redis or similar.
 * Since Netlify functions are stateless, this only works within a single
 * function invocation cold start window. For true rate limiting at scale,
 * use Netlify's built-in rate limiting or a CDN layer.
 */

const requests = new Map<string, number[]>();

const WINDOW_MS = 60_000; // 1 minute window
const MAX_REQUESTS = 60; // 60 requests per minute per key

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = requests.get(key) || [];

  // Remove entries outside the window
  const valid = timestamps.filter((t) => now - t < WINDOW_MS);

  if (valid.length >= MAX_REQUESTS) {
    requests.set(key, valid);
    return true;
  }

  valid.push(now);
  requests.set(key, valid);
  return false;
}

export function getRateLimitHeaders(key: string): Record<string, string> {
  const timestamps = requests.get(key) || [];
  const now = Date.now();
  const valid = timestamps.filter((t) => now - t < WINDOW_MS);
  const remaining = Math.max(0, MAX_REQUESTS - valid.length);

  return {
    'X-RateLimit-Limit': String(MAX_REQUESTS),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil((now + WINDOW_MS) / 1000)),
  };
}
