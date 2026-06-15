import { handleCors } from '../../lib/cors';
import type { Handler } from '@netlify/functions';
import { getAlertSchedulesRef } from '../../lib/firestore';
import { parseJsonObject, scheduleUpdates } from '../../lib/validation';
import { upsertCloudflareScheduleIndex } from '../../lib/cloudflareScheduleIndex';

const handler: Handler = async (event) => {
  const corsResp = handleCors(event.httpMethod); if (corsResp) return corsResp;
  if (event.httpMethod !== 'PUT') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const userId = event.headers['x-user-id'] || 'default-user';
  const id = event.queryStringParameters?.id;

  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'id query parameter is required' }) };
  }

  try {
    const updates = {
      ...scheduleUpdates(parseJsonObject(event.body)),
      updatedAt: new Date().toISOString(),
    };

    const docRef = getAlertSchedulesRef(userId).doc(id);
    await docRef.update(updates);

    const updated = await docRef.get();
    if (updated.exists) {
      await upsertCloudflareScheduleIndex(userId, updated.id, updated.data() || {}).catch((error) => {
        console.error('Cloudflare schedule index sync failed:', error);
      });
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ id: updated.id, ...updated.data() }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update alert schedule';
    return { statusCode: 400, body: JSON.stringify({ error: message }) };
  }
};

export { handler };
