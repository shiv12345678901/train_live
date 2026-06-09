import type { Handler } from '@netlify/functions';
import { getAlertSchedulesRef, getAlertDeliveryStateRef } from '../../lib/firestore';

const handler: Handler = async (event) => {
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
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to delete alert schedule' }) };
  }
};

export { handler };
