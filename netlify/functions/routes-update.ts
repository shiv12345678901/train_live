import { handleCors, CORS_HEADERS } from '../../lib/cors';
import type { Handler } from '@netlify/functions';
import { getRouteCardsRef } from '../../lib/firestore';
import { parseJsonObject, routeUpdates } from '../../lib/validation';

const handler: Handler = async (event) => {
  const corsResp = handleCors(event.httpMethod); if (corsResp) return corsResp;
  if (event.httpMethod !== 'PUT') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const userId = event.headers['x-user-id'] || 'default-user';
  const id = event.queryStringParameters?.id;

  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'id query parameter is required' }) };
  }

  try {
    const updates = {
      ...routeUpdates(parseJsonObject(event.body)),
      updatedAt: new Date().toISOString(),
    };

    const docRef = getRouteCardsRef(userId).doc(id);
    await docRef.update(updates);

    const updated = await docRef.get();
    return {
      statusCode: 200,
      body: JSON.stringify({ id: updated.id, ...updated.data() }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update route card';
    return { statusCode: 400, body: JSON.stringify({ error: message }) };
  }
};

export { handler };
