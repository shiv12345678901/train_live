import type { Handler } from '@netlify/functions';
import { getRouteCardsRef } from '../../lib/firestore';

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const userId = event.headers['x-user-id'] || 'default-user';

  try {
    const body = JSON.parse(event.body || '{}');
    const { title, origin, destination, routeFilter } = body;

    // Validate required fields
    if (!title || !origin || !destination) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'title, origin, and destination are required' }),
      };
    }

    // Validate origin ≠ destination
    if (origin === destination) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'origin and destination must be different' }),
      };
    }

    // Determine the next order value
    const snapshot = await getRouteCardsRef(userId).orderBy('order', 'desc').limit(1).get();
    const maxOrder = snapshot.empty ? 0 : (snapshot.docs[0].data().order as number) ?? 0;

    const now = new Date().toISOString();
    const docData = {
      title,
      origin,
      destination,
      routeFilter: routeFilter || [],
      order: maxOrder + 1,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await getRouteCardsRef(userId).add(docData);

    return {
      statusCode: 201,
      body: JSON.stringify({ id: docRef.id, ...docData }),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create route card', detail: msg }) };
  }
};

export { handler };
