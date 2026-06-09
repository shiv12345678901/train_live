import type { Handler } from '@netlify/functions';
import { getAlertSchedulesRef } from '../../lib/firestore';
import { parseJsonObject, scheduleCreateData } from '../../lib/validation';

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const userId = event.headers['x-user-id'] || 'default-user';

  try {
    const now = new Date().toISOString();
    const docData = {
      ...scheduleCreateData(parseJsonObject(event.body)),
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await getAlertSchedulesRef(userId).add(docData);

    return {
      statusCode: 201,
      body: JSON.stringify({ id: docRef.id, ...docData }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create alert schedule';
    return { statusCode: 400, body: JSON.stringify({ error: message }) };
  }
};

export { handler };
