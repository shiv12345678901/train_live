import type { Handler } from '@netlify/functions';
import { runAlertScheduler, runAlertSchedulerForSchedule } from './alert-scheduler';

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const readSecret = (event: Parameters<Handler>[0]): string => {
  const headerSecret = event.headers['x-scheduler-secret'] || event.headers['X-Scheduler-Secret'];
  return headerSecret || event.queryStringParameters?.secret || '';
};

const handler: Handler = async (event, context) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return json(405, { error: 'Method not allowed' });
  }

  const configuredSecret = process.env.SCHEDULER_SECRET;
  if (!configuredSecret) {
    return json(503, {
      error: 'SCHEDULER_SECRET is not configured',
      message: 'Set SCHEDULER_SECRET in Netlify and call this endpoint with x-scheduler-secret to run the alert scheduler from an external cron.',
    });
  }

  const providedSecret = readSecret(event);
  if (providedSecret !== configuredSecret) {
    return json(401, { error: 'Invalid scheduler secret' });
  }

  const userId = event.queryStringParameters?.userId || 'default-user';
  const scheduleId = event.queryStringParameters?.scheduleId;
  const eventName = event.queryStringParameters?.event;
  const departureTime = event.queryStringParameters?.departureTime;
  if (scheduleId) {
    const result = await runAlertSchedulerForSchedule(userId, scheduleId, eventName, departureTime);
    return json(200, { ok: result.sent > 0, userId, scheduleId, event: eventName || null, departureTime: departureTime || null, ...result });
  }

  const response = await runAlertScheduler(event, context);
  return response || json(200, { ok: true });
};

export { handler };
