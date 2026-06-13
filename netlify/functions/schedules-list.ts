import { handleCors } from '../../lib/cors';
import type { Handler } from '@netlify/functions';
import { getAlertDeliveryStateRef, getAlertSchedulesRef } from '../../lib/firestore';

const handler: Handler = async (event) => {
  const corsResp = handleCors(event.httpMethod); if (corsResp) return corsResp;
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const userId = event.headers['x-user-id'] || 'default-user';

  try {
    const snapshot = await getAlertSchedulesRef(userId).get();
    const schedules = await Promise.all(snapshot.docs.map(async (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      const deliveryDoc = await getAlertDeliveryStateRef(userId).doc(doc.id).get();
      return {
        id: doc.id,
        ...doc.data(),
        cloudflareIndexed: !doc.id.startsWith('local-'),
        deliveryState: deliveryDoc.exists ? deliveryDoc.data() : { sentKeys: [] },
      };
    }));
    return { statusCode: 200, body: JSON.stringify(schedules) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch alert schedules';
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
};

export { handler };
