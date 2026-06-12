import { handleCors, CORS_HEADERS } from '../../lib/cors';
import type { Handler } from '@netlify/functions';

const handler: Handler = async (event) => {
  const corsResp = handleCors(event.httpMethod);
  if (corsResp) return corsResp;

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ ok: true, time: new Date().toISOString() }),
  };
};

export { handler };
