import type { Handler } from '@netlify/functions';
import { db, getRouteCardsRef } from '../../lib/firestore';

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'PUT') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const userId = event.headers['x-user-id'] || 'default-user';

  try {
    const body = JSON.parse(event.body || '{}');
    const { orderedIds } = body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'orderedIds array is required' }),
      };
    }

    const batch = db.batch();
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
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update route order' }) };
  }
};

export { handler };
