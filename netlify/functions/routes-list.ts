import { handleCors } from '../../lib/cors';
import type { Handler } from '@netlify/functions';
import { getRouteCardsRef } from '../../lib/firestore';

const handler: Handler = async (event) => {
  const corsResp = handleCors(event.httpMethod); if (corsResp) return corsResp;
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const userId = event.headers['x-user-id'] || 'default-user';

  try {
    const snapshot = await getRouteCardsRef(userId).orderBy('order').get();
    const cards = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() }));
    return { statusCode: 200, body: JSON.stringify(cards) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch route cards', detail: msg }) };
  }
};

export { handler };
