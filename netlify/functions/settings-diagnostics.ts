import { handleCors } from '../../lib/cors';
import type { Handler } from '@netlify/functions';
import { getAlertSchedulesRef, getRouteCardsRef, getSettingsRef } from '../../lib/firestore';

const handler: Handler = async (event) => {
  const corsResp = handleCors(event.httpMethod); if (corsResp) return corsResp;
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const userId = event.headers['x-user-id'] || 'default-user';

  try {
    const [settingsDoc, routesSnapshot, schedulesSnapshot] = await Promise.all([
      getSettingsRef(userId).get(),
      getRouteCardsRef(userId).get(),
      getAlertSchedulesRef(userId).get(),
    ]);
    const settings = settingsDoc.data();
    const schedules = schedulesSnapshot.docs.map((doc) => doc.data());

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        firestore: true,
        telegram: {
          hasSettingsToken: Boolean(settings?.telegramBotToken),
          hasSettingsChatId: Boolean(settings?.telegramChatId),
          hasEnvToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
          hasEnvChatId: Boolean(process.env.TELEGRAM_CHAT_ID),
        },
        scheduler: {
          hasSecret: Boolean(process.env.SCHEDULER_SECRET),
          hasTfnswApiKey: Boolean(process.env.TFN_API_KEY),
          hasCloudflareAccount: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID),
          hasCloudflareKv: Boolean(process.env.CLOUDFLARE_KV_NAMESPACE_ID),
          hasCloudflareToken: Boolean(process.env.CLOUDFLARE_API_TOKEN),
        },
        counts: {
          routes: routesSnapshot.size,
          schedules: schedulesSnapshot.size,
          activeSchedules: schedules.filter((schedule) => schedule.enabled === true).length,
          completedSchedules: schedules.filter((schedule) => {
            const oneTimeDate = String(schedule.oneTimeDate || '');
            return oneTimeDate && oneTimeDate < new Date().toISOString().slice(0, 10);
          }).length,
        },
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read diagnostics';
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, firestore: false, error: message }),
    };
  }
};

export { handler };
