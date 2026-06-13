import type { Handler } from '@netlify/functions';
import { getAlertSchedulesRef, getDb } from '../../lib/firestore';
import { upsertCloudflareScheduleIndex } from '../../lib/cloudflareScheduleIndex';

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const configuredSecret = process.env.SCHEDULER_SECRET;
  const providedSecret = event.headers['x-scheduler-secret'] || event.queryStringParameters?.secret || '';
  if (!configuredSecret || providedSecret !== configuredSecret) {
    return json(401, { error: 'Invalid scheduler secret' });
  }

  let synced = 0;
  const failures: string[] = [];
  const usersSnapshot = await getDb().collection('users').get();

  for (const userDoc of usersSnapshot.docs) {
    const schedulesSnapshot = await getAlertSchedulesRef(userDoc.id).get();
    for (const scheduleDoc of schedulesSnapshot.docs) {
      try {
        await upsertCloudflareScheduleIndex(userDoc.id, scheduleDoc.id, scheduleDoc.data());
        synced += 1;
      } catch (error) {
        failures.push(`${userDoc.id}/${scheduleDoc.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return json(failures.length ? 207 : 200, { ok: failures.length === 0, synced, failures });
};

export { handler };
