import { handleCors, CORS_HEADERS } from '../../lib/cors';
import type { Handler } from '@netlify/functions';
import { getAlertSchedulesRef, getAlertDeliveryStateRef } from '../../lib/firestore';

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
    // Delete the alert schedule document
    await getAlertSchedulesRef(userId).doc(id).delete();

    // Also delete the corresponding alertDeliveryState document
    await getAlertDeliveryStateRef(userId).doc(id).delete();

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete alert schedule';
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
};

export { handler };
