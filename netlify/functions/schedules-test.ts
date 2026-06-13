import { handleCors } from '../../lib/cors';
import type { Handler } from '@netlify/functions';
import { FieldValue } from 'firebase-admin/firestore';
import { getAlertDeliveryStateRef, getAlertSchedulesRef, getSettingsRef } from '../../lib/firestore';
import { sendMessageWithRetry } from '../../lib/telegram';
import { parseJsonObject } from '../../lib/validation';

const handler: Handler = async (event) => {
  const corsResp = handleCors(event.httpMethod); if (corsResp) return corsResp;
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const userId = event.headers['x-user-id'] || 'default-user';

  try {
    const body = parseJsonObject(event.body);
    const { scheduleId } = body;

    if (typeof scheduleId !== 'string' || !scheduleId.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'scheduleId is required' }),
      };
    }

    const cleanScheduleId = scheduleId.trim();
    const scheduleDoc = await getAlertSchedulesRef(userId).doc(cleanScheduleId).get();
    if (!scheduleDoc.exists) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Alert schedule not found' }),
      };
    }

    const settingsDoc = await getSettingsRef(userId).get();
    const settings = settingsDoc.data();

    const botToken = settings?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = settings?.telegramChatId || process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Telegram bot token and chat ID must be configured in settings or Netlify environment variables',
        }),
      };
    }

    const schedule = scheduleDoc.data();
    const testMessage = [
      `${schedule?.title || 'Saved route'}`,
      `At: ${schedule?.departureTime || 'N/A'}`,
      `Platform: ${schedule?.selectedPlatform || 'TBC'}`,
      `Alert: Test message sent successfully`,
    ].join('\n');

    const success = await sendMessageWithRetry(botToken, chatId, testMessage);

    if (success) {
      await getAlertDeliveryStateRef(userId).doc(cleanScheduleId).set({
        activity: FieldValue.arrayUnion({
          sentAt: new Date().toISOString(),
          sentKey: `test:${Date.now()}`,
          message: testMessage,
          source: 'test',
        }),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: 'Test message sent successfully',
          credentialSource: settings?.telegramBotToken && settings?.telegramChatId ? 'settings' : 'environment',
        }),
      };
    }

    return {
      statusCode: 502,
      body: JSON.stringify({ success: false, error: 'Failed to send test message via Telegram' }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send test alert';
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
};

export { handler };
