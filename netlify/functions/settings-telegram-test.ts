import { handleCors } from '../../lib/cors';
import type { Handler } from '@netlify/functions';
import { getSettingsRef } from '../../lib/firestore';
import { sendMessageWithRetry } from '../../lib/telegram';

const handler: Handler = async (event) => {
  const corsResp = handleCors(event.httpMethod); if (corsResp) return corsResp;
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const userId = event.headers['x-user-id'] || 'default-user';

  try {
    const settingsDoc = await getSettingsRef(userId).get();
    const settings = settingsDoc.data();
    const botToken = settings?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = settings?.telegramChatId || process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Telegram bot token and chat ID are not configured' }),
      };
    }

    const message = [
      'Train Live settings test',
      `At: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' })}`,
      'Alert: Telegram connection is working',
    ].join('\n');

    const success = await sendMessageWithRetry(botToken, chatId, message);
    if (!success) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Failed to send Telegram test message' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        credentialSource: settings?.telegramBotToken && settings?.telegramChatId ? 'settings' : 'environment',
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to test Telegram';
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: message }),
    };
  }
};

export { handler };
