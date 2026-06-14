import { handleCors } from '../../lib/cors';
import type { Handler } from '@netlify/functions';
import { FieldValue } from 'firebase-admin/firestore';
import { getAlertDeliveryStateRef, getAlertSchedulesRef, getRouteCardsRef, getSettingsRef } from '../../lib/firestore';
import { sendMessageWithRetry } from '../../lib/telegram';
import { parseJsonObject } from '../../lib/validation';
import { fetchRouteTrainDepartures, type TrainDeparture } from './routes-trains';

const TRAIN_TEST_LIMIT = 5;
const NSW_TIME_ZONE = 'Australia/Sydney';

function shortStop(name: string): string {
  return name.replace(/\s*(Station|Wharf|Light Rail)\s*/gi, '').replace(/,.*$/, '').trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatIsoSydneyTime(isoTime?: string): string {
  if (!isoTime) return '';
  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: NSW_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function trainTime(train: TrainDeparture): string {
  return formatIsoSydneyTime(train.estimatedTime || train.scheduledTime) || 'Live time unavailable';
}

function statusText(train: TrainDeparture): string {
  if (train.cancelled || train.status === 'cancelled') return 'Cancelled';
  if (train.status === 'delayed' && train.delayMinutes) return `Delayed ${train.delayMinutes} min`;
  if (train.status === 'on-time') return 'On time';
  return train.status || 'Unknown';
}

function serviceAlertText(train: TrainDeparture): string | undefined {
  const serviceAlert = train.alerts.find((alert) => alert.title || alert.description);
  if (!serviceAlert) return undefined;
  return [serviceAlert.title, serviceAlert.description]
    .filter(Boolean)
    .join(' - ')
    .slice(0, 500);
}

function formatTrainDetailsMessage(opts: {
  origin: string;
  destination: string;
  train: TrainDeparture;
  others: TrainDeparture[];
}): string {
  const { origin, destination, train, others } = opts;
  const lines = [
    `<b>${escapeHtml(shortStop(origin))} to ${escapeHtml(shortStop(destination))}</b>`,
    `At: <b>${escapeHtml(trainTime(train))}</b>`,
  ];

  if (train.platform) lines.push(`Platform: <b>${escapeHtml(train.platform)}</b>`);
  lines.push(`Status: ${escapeHtml(statusText(train))}`);

  const alert = serviceAlertText(train);
  if (alert) lines.push(`Alert: ${escapeHtml(alert)}`);

  const otherTrains = others.filter((other) =>
    `${other.tripId}:${other.scheduledTime}:${other.platform}` !== `${train.tripId}:${train.scheduledTime}:${train.platform}`
  ).slice(0, 4);

  if (otherTrains.length > 0) {
    lines.push('');
    lines.push('Other trains:');
    for (const other of otherTrains) {
      lines.push(`${trainTime(other)} - Platform ${escapeHtml(other.platform || 'TBC')} - ${escapeHtml(statusText(other))}`);
    }
  }

  return lines.join('\n');
}

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

    const apiKey = process.env.TFN_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 503,
        body: JSON.stringify({ error: 'TFN_API_KEY not configured' }),
      };
    }

    const schedule = scheduleDoc.data();
    const routeCardId = String(schedule?.routeCardId || '');
    if (!routeCardId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Schedule is missing a route' }),
      };
    }

    const routeDoc = await getRouteCardsRef(userId).doc(routeCardId).get();
    if (!routeDoc.exists) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Route for this schedule was not found' }),
      };
    }

    const route = routeDoc.data() || {};
    const origin = String(route.origin || '');
    const destination = String(route.destination || '');
    if (!origin || !destination) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Route is missing origin or destination' }),
      };
    }

    const trains = await fetchRouteTrainDepartures({
      apiKey,
      origin,
      destination,
      originStopId: String(route.originStopId || ''),
      destinationStopId: String(route.destinationStopId || ''),
      mode: route.mode || 'train',
      limit: TRAIN_TEST_LIMIT,
    });

    const nextTrain = trains.find((train) =>
      new Date(train.estimatedTime || train.scheduledTime).getTime() >= Date.now() - 60 * 1000
    ) || trains[0];

    if (!nextTrain) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'No upcoming trains returned for this route' }),
      };
    }

    const testMessage = formatTrainDetailsMessage({
      origin,
      destination,
      train: nextTrain,
      others: trains,
    });

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
