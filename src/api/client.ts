export const API_BASE = import.meta.env.VITE_API_BASE_URL || '/.netlify/functions';
export const DEFAULT_USER_ID = 'default-user';

/**
 * Make a JSON API request with automatic retry on 429 (rate limited).
 */
export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const maxRetries = 2;
  let attempt = 0;

  while (attempt <= maxRetries) {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          'x-user-id': DEFAULT_USER_ID,
          ...init.headers,
        },
      });
    } catch (error) {
      throw new Error('Network error - check your connection', { cause: error });
    }

    // Retry on rate limit (429)
    if (res.status === 429 && attempt < maxRetries) {
      attempt++;
      await delay(1000 * attempt); // Wait 1s, then 2s
      continue;
    }

    if (!res.ok) {
      throw new Error(await responseMessage(res));
    }

    return res.json() as Promise<T>;
  }

  throw new Error('Request failed after retries');
}

export async function requestVoid(path: string, init: RequestInit = {}): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'x-user-id': DEFAULT_USER_ID,
        ...init.headers,
      },
    });
  } catch (error) {
    throw new Error('Network error - check your connection', { cause: error });
  }

  if (!res.ok) {
    throw new Error(await responseMessage(res));
  }
}

async function responseMessage(res: Response): Promise<string> {
  try {
    const body = await res.json() as { error?: string; detail?: string };
    return body.detail || body.error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
