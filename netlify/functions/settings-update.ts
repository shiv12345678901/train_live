import { handleCors } from '../../lib/cors';
import type { Handler } from '@netlify/functions';
import { getSettingsRef } from '../../lib/firestore';
import { parseJsonObject, settingsUpdates } from '../../lib/validation';

const handler: Handler = async (event) => {
  const corsResp = handleCors(event.httpMethod); if (corsResp) return corsResp;
  if (event.httpMethod !== 'PUT') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const userId = event.headers['x-user-id'] || 'default-user';

  try {
    const updates = {
      ...settingsUpdates(parseJsonObject(event.body)),
      updatedAt: new Date().toISOString(),
    };

    await getSettingsRef(userId).set(updates, { merge: true });
    const updated = await getSettingsRef(userId).get();

    return {
      statusCode: 200,
      body: JSON.stringify(updated.data()),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update settings';
    return { statusCode: 400, body: JSON.stringify({ error: message }) };
  }
};

export { handler };

