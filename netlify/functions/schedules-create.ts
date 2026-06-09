import type { Handler } from '@netlify/functions';
import { getAlertSchedulesRef } from '../../lib/firestore';

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const userId = event.headers['x-user-id'] || 'default-user';

  try {
    const body = JSON.parse(event.body || '{}');
    const { routeCardId, title, departureTime } = body;

    // Validate required fields
    if (!routeCardId || !title || !departureTime) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'routeCardId, title, and departureTime are required' }),
      };
    }

    const now = new Date().toISOString();
    const docData = {
      routeCardId,
      title,
      departureTime,
      days: body.days || [],
      oneTimeDate: body.oneTimeDate || null,
      enabled: body.enabled !== undefined ? body.enabled : true,
      fixedReminderMinutes: body.fixedReminderMinutes || [20, 15, 10, 5],
      changeCheckMinutes: body.changeCheckMinutes || [18, 13],
      selectedTripId: body.selectedTripId || null,
      selectedPlatform: body.selectedPlatform || null,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await getAlertSchedulesRef(userId).add(docData);

    return {
      statusCode: 201,
      body: JSON.stringify({ id: docRef.id, ...docData }),
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create alert schedule' }) };
  }
};

export { handler };
