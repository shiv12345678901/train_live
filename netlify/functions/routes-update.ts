import type { Handler } from '@netlify/functions';
import { getRouteCardsRef } from '../../lib/firestore';

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'PUT') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const userId = event.headers['x-user-id'] || 'default-user';
  const id = event.queryStringParameters?.id;

  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'id query parameter is required' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const updates = {
      ...body,
      updatedAt: new Date().toISOString(),
    };

    // Remove id from updates if present (should not overwrite doc ID)
    delete updates.id;

    const docRef = getRouteCardsRef(userId).doc(id);
    await docRef.update(updates);

    const updated = await docRef.get();
    return {
      statusCode: 200,
      body: JSON.stringify({ id: updated.id, ...updated.data() }),
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update route card' }) };
  }
};

export { handler };
