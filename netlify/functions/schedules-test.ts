import { handleCors, CORS_HEADERS } from '../../lib/cors';
import type { Handler } from '@netlify/functions';
import { getAlertSchedulesRef, getSettingsRef } from '../../lib/firestore';
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

    // Read the schedule to get route details for the test message
    const scheduleDoc = await getAlertSchedulesRef(userId).doc(scheduleId.trim()).get();
    if (!scheduleDoc.exists) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Alert schedule not found' }),
      };
    }

    // Read Telegram bot token and chat ID from user settings
    const settingsDoc = await getSettingsRef(userId).get();
    const settings = settingsDoc.data();

    if (!settings?.telegramBotToken || !settings?.telegramChatId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Telegram bot token and chat ID must be configured in settings' }),
      };
    }

    const schedule = scheduleDoc.data();
    const testMessage = [
      `✅ <b>Test Alert</b>`,
      ``,
      `This is a test message for: <b>${schedule?.title || 'Unknown'}</b>`,
      `Departure: ${schedule?.departureTime || 'N/A'}`,
      ``,
      `Your alerts are working correctly!`,
    ].join('\n');

    const success = await sendMessageWithRetry(
      settings.telegramBotToken,
      settings.telegramChatId,
      testMessage
    );

    if (success) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: 'Test message sent successfully' }),
      };
    } else {
      return {
        statusCode: 502,
        body: JSON.stringify({ success: false, error: 'Failed to send test message via Telegram' }),
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send test alert';
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
};

export { handler };
