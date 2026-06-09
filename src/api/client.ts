export const API_BASE = import.meta.env.VITE_API_BASE_URL || '/.netlify/functions';
export const DEFAULT_USER_ID = 'default-user';

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
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

  return res.json() as Promise<T>;
}

export async function requestVoid(path: string, init: RequestInit = {}): Promise<void> {
  await requestJson<unknown>(path, init);
}

async function responseMessage(res: Response): Promise<string> {
  try {
    const body = await res.json() as { error?: string; detail?: string };
    return body.detail || body.error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

