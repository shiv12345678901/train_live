import { handleCors, CORS_HEADERS } from '../../lib/cors';
import type { Handler } from '@netlify/functions';
import { getAlertDeliveryStateRef, getAlertSchedulesRef, getDb, getRouteCardsRef } from '../../lib/firestore';

const handler: Handler = async (event) => {
  const corsResp = handleCors(event.httpMethod); if (corsResp) return corsResp;
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const userId = event.headers['x-user-id'] || 'default-user';
  const id = event.queryStringParameters?.id;

  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'id query parameter is required' }) };
  }

  try {
    const batch = getDb().batch();
    batch.delete(getRouteCardsRef(userId).doc(id));

    const schedules = await getAlertSchedulesRef(userId).where('routeCardId', '==', id).get();
    for (const schedule of schedules.docs) {
      batch.delete(schedule.ref);
      batch.delete(getAlertDeliveryStateRef(userId).doc(schedule.id));
    }

    await batch.commit();
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id, deletedSchedules: schedules.size }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete route card';
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
};

export { handler };
