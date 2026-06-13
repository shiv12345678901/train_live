import { handleCors } from '../../lib/cors';
import type { Handler } from '@netlify/functions';
import { getRouteCardsRef } from '../../lib/firestore';
import { parseJsonObject, routeCreateData } from '../../lib/validation';

const handler: Handler = async (event) => {
  const corsResp = handleCors(event.httpMethod); if (corsResp) return corsResp;
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const userId = event.headers['x-user-id'] || 'default-user';

  try {
    const route = routeCreateData(parseJsonObject(event.body));

    // Determine the next order value
    const snapshot = await getRouteCardsRef(userId).orderBy('order', 'desc').limit(1).get();
    const maxOrder = snapshot.empty ? 0 : (snapshot.docs[0].data().order as number) ?? 0;

    const now = new Date().toISOString();
    const docData = {
      ...route,
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
    return { statusCode: 400, body: JSON.stringify({ error: msg }) };
  }
};

export { handler };
