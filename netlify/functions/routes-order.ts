import type { Handler } from '@netlify/functions';
import { getDb, getRouteCardsRef } from '../../lib/firestore';
import { parseJsonObject } from '../../lib/validation';

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'PUT') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const userId = event.headers['x-user-id'] || 'default-user';

  try {
    const body = parseJsonObject(event.body);
    const { orderedIds } = body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0 || !orderedIds.every((id) => typeof id === 'string')) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'orderedIds array is required' }),
      };
    }

    const batch = getDb().batch();
    const collectionRef = getRouteCardsRef(userId);

    orderedIds.forEach((id: string, index: number) => {
      const docRef = collectionRef.doc(id);
      batch.update(docRef, { order: index, updatedAt: new Date().toISOString() });
    });

    await batch.commit();

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, orderedIds }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update route order';
    return { statusCode: 400, body: JSON.stringify({ error: message }) };
  }
};

export { handler };
