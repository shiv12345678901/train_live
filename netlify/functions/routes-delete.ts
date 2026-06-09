import type { Handler } from '@netlify/functions';
import { getRouteCardsRef } from '../../lib/firestore';

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
    await getRouteCardsRef(userId).doc(id).delete();
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id }),
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to delete route card' }) };
  }
};

export { handler };
