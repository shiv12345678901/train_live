import type { Handler } from '@netlify/functions';
import { schedule } from '@netlify/functions';
import { FieldValue } from 'firebase-admin/firestore';
import {
  getAlertSchedulesRef,
  getAlertDeliveryStateRef,
  getDb,
  getRouteCardsRef,
  getSettingsRef,
} from '../../lib/firestore';
import { fetchWithTimeout } from '../../lib/http';
import { getTimingStatus } from '../../lib/trainParsing';
import { sendMessageWithRetry } from '../../lib/telegram';

// ─── Helpers ────────────────────────────────────────────────────────

function isWithinWindow(minutesUntilDeparture: number, targetMinutes: number): boolean {
  return minutesUntilDeparture >= targetMinutes - 0.5 && minutesUntilDeparture < targetMinutes + 0.5;
}

function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

interface LiveTrain {
  route: string;
  platform: string;
  scheduledTime: string;
  estimatedTime?: string;
  status: string;
  delayMinutes?: number;
  cancelled: boolean;
}

// ─── Fetch live train for a route at departure time ─────────────────

async function fetchLiveTrainStatus(
  origin: string,
  destination: string,
  departureTimeHHmm: string,
  apiKey: string,
  originStopId?: string,
  destinationStopId?: string,
  selectedTripId?: string,
  selectedPlatform?: string
): Promise<LiveTrain | null> {
  try {
    const originType = originStopId ? 'stop' : 'any';
    const originName = originStopId || origin;
    const destinationType = destinationStopId ? 'stop' : 'any';
    const destinationName = destinationStopId || destination;
    const url = `https://api.transport.nsw.gov.au/v1/tp/trip?outputFormat=rapidJSON&coordOutputFormat=EPSG%3A4326&depArrMacro=dep&type_origin=${originType}&name_origin=${encodeURIComponent(originName)}&type_destination=${destinationType}&name_destination=${encodeURIComponent(destinationName)}&calcNumberOfTrips=5&TfNSWTR=true&version=10.2.1.42`;

    const res = await fetchWithTimeout(url, { headers: { 'Authorization': `apikey ${apiKey}` } });
    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, unknown>;
    const journeys = (data?.journeys || []) as Array<Record<string, unknown>>;

    // Find the journey closest to user's saved departure time
    const [targetH, targetM] = departureTimeHHmm.split(':').map(Number);

    for (const journey of journeys) {
      const legs = (journey.legs || []) as Array<Record<string, unknown>>;
      const transitLegs = legs.filter((candidate) => {
        const candidateTransportation = (candidate.transportation || {}) as Record<string, unknown>;
        const candidateProduct = (candidateTransportation.product || {}) as Record<string, unknown>;
        return Number(candidateProduct.class) !== 100;
      });
      if (transitLegs.length !== 1) continue;

      const leg = transitLegs[0];
      const transportation = (leg.transportation || {}) as Record<string, unknown>;

      const originInfo = (leg.origin || {}) as Record<string, unknown>;
      const scheduledTime = (originInfo.departureTimePlanned as string) || '';
      const estimatedTime = (originInfo.departureTimeEstimated as string) || undefined;

      if (!scheduledTime) continue;

      // Check if this train's scheduled time is close to our target
      const schedDate = new Date(scheduledTime);
      const schedH = schedDate.getHours();
      const schedM = schedDate.getMinutes();
      const diffMins = Math.abs((schedH * 60 + schedM) - (targetH * 60 + targetM));
      if (diffMins > 10) continue; // Only match within 10 min of target

      const platformRaw = (originInfo.disassembledName as string) || '';
      const platformMatch = platformRaw.match(/(\d+|[A-Z])$/);
      const platform = platformMatch ? platformMatch[1] : '';
      if (selectedPlatform && platform && selectedPlatform !== platform) continue;

      const tripId = (transportation.id as string) || '';
      if (selectedTripId && tripId && selectedTripId !== tripId && diffMins > 2) continue;

      const line = (transportation.disassembledName || transportation.number || '') as string;
      const isCancelled = leg.isCancelled === true;

      const { status, delayMinutes } = getTimingStatus(scheduledTime, estimatedTime, isCancelled);

      return { route: line, platform, scheduledTime, estimatedTime, status, delayMinutes, cancelled: isCancelled };
    }

    return null;
  } catch {
    return null;
  }
}

async function reserveSentKey(userId: string, scheduleId: string, sentKey: string): Promise<boolean> {
  const deliveryRef = getAlertDeliveryStateRef(userId).doc(scheduleId);
  return getDb().runTransaction(async (transaction) => {
    const deliveryDoc = await transaction.get(deliveryRef);
    const sentKeys = (deliveryDoc.data()?.sentKeys || []) as string[];
    if (sentKeys.includes(sentKey)) return false;

    transaction.set(deliveryRef, {
      sentKeys: [...sentKeys, sentKey],
    }, { merge: true });
    return true;
  });
}

async function releaseSentKey(userId: string, scheduleId: string, sentKey: string): Promise<void> {
  await getAlertDeliveryStateRef(userId).doc(scheduleId).set({
    sentKeys: FieldValue.arrayRemove(sentKey),
  }, { merge: true });
}

async function updateDeliveryState(
  userId: string,
  scheduleId: string,
  train: LiveTrain | null,
  fallbackState: unknown
): Promise<void> {
  await getAlertDeliveryStateRef(userId).doc(scheduleId).set({
    lastKnownTripState: train ? {
      estimatedTime: train.estimatedTime,
      platform: train.platform,
      status: train.status,
    } : fallbackState,
  }, { merge: true });
}

// ─── Message Formatting ─────────────────────────────────────────────

function formatReminderMessage(opts: {
  title: string;
  origin: string;
  destination: string;
  departureTime: string;
  offsetMinutes: number;
  train: LiveTrain | null;
}): string {
  const { title, origin, destination, departureTime, offsetMinutes, train } = opts;
  const shortOrigin = origin.replace(/\s*(Station|Wharf|Light Rail)\s*/gi, '').trim();
  const shortDest = destination.replace(/\s*(Station|Wharf|Light Rail)\s*/gi, '').trim();

  const lines: string[] = [
    `🚆 <b>${title}</b>`,
    ``,
    `${shortOrigin} → ${shortDest}`,
    `⏰ <b>${formatTime12h(departureTime)}</b> — ${offsetMinutes} min reminder`,
  ];

  if (train) {
    if (train.platform) {
      lines.push(`📍 Platform ${train.platform}`);
    }
    if (train.route) {
      lines.push(`🚇 ${train.route}`);
    }

    if (train.cancelled) {
      lines.push(``);
      lines.push(`❌ <b>CANCELLED</b> — Check app for alternatives`);
    } else if (train.status === 'delayed' && train.delayMinutes) {
      lines.push(``);
      lines.push(`⚠️ Delayed ${train.delayMinutes} min`);
      if (train.estimatedTime) {
        const est = new Date(train.estimatedTime);
        lines.push(`New time: ${est.getHours().toString().padStart(2, '0')}:${est.getMinutes().toString().padStart(2, '0')}`);
      }
    } else {
      lines.push(``);
      lines.push(`✅ On time`);
    }
  } else {
    lines.push(``);
    lines.push(`ℹ️ Live status unavailable`);
  }

  return lines.join('\n');
}

function formatChangeMessage(opts: {
  title: string;
  origin: string;
  destination: string;
  departureTime: string;
  change: string;
  train: LiveTrain;
}): string {
  const { title, origin, destination, departureTime, change, train } = opts;
  const shortOrigin = origin.replace(/\s*(Station|Wharf|Light Rail)\s*/gi, '').trim();
  const shortDest = destination.replace(/\s*(Station|Wharf|Light Rail)\s*/gi, '').trim();

  const lines: string[] = [
    `⚠️ <b>${title} — Update</b>`,
    ``,
    `${shortOrigin} → ${shortDest} (${formatTime12h(departureTime)})`,
    ``,
    change,
  ];

  if (train.platform) {
    lines.push(`📍 Platform ${train.platform}`);
  }

  return lines.join('\n');
}

// ─── Main Scheduler ─────────────────────────────────────────────────

const schedulerHandler: Handler = async () => {
  const apiKey = process.env.TFN_API_KEY;

  try {
    const usersSnapshot = await getDb().collection('users').get();

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const schedulesSnapshot = await getAlertSchedulesRef(userId)
        .where('enabled', '==', true)
        .get();

      if (schedulesSnapshot.empty) continue;

      // Get Telegram credentials
      const settingsDoc = await getSettingsRef(userId).get();
      const settings = settingsDoc.data();
      const botToken = settings?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
      const chatId = settings?.telegramChatId || process.env.TELEGRAM_CHAT_ID;
      if (!botToken || !chatId) continue;

      const now = new Date();
      const today = now.getDay();

      for (const scheduleDoc of schedulesSnapshot.docs) {
        const alert = scheduleDoc.data();
        const scheduleId = scheduleDoc.id;
        const departureTime: string = alert.departureTime;
        if (!departureTime) continue;

        // Check if schedule applies today
        if (alert.oneTimeDate) {
          const targetDate = new Date(alert.oneTimeDate);
          if (targetDate.toDateString() !== now.toDateString()) continue;
        } else if (alert.days?.length > 0) {
          if (!alert.days.includes(today)) continue;
        } else {
          continue;
        }

        // Calculate minutes until departure
        const [hours, minutes] = departureTime.split(':').map(Number);
        const departureDate = new Date(now);
        departureDate.setHours(hours, minutes, 0, 0);
        const minsUntilDeparture = (departureDate.getTime() - now.getTime()) / 60000;

        // Skip if not within our processing window
        if (minsUntilDeparture < -1 || minsUntilDeparture > 22) continue;

        // Get route card for origin/destination
        let origin = '';
        let destination = '';
        let originStopId = '';
        let destinationStopId = '';
        if (alert.routeCardId) {
          const cardDoc = await getRouteCardsRef(userId).doc(alert.routeCardId).get();
          if (cardDoc.exists) {
            const cardData = cardDoc.data()!;
            origin = cardData.origin || '';
            destination = cardData.destination || '';
            originStopId = cardData.originStopId || '';
            destinationStopId = cardData.destinationStopId || '';
          }
        }

        // Load delivery state
        const deliveryRef = getAlertDeliveryStateRef(userId).doc(scheduleId);
        const deliveryDoc = await deliveryRef.get();
        const delivery = deliveryDoc.data() || { sentKeys: [], lastKnownTripState: null };
        const sentKeys: string[] = delivery.sentKeys || [];
        const departureIso = departureDate.toISOString().slice(0, 10);

        // Clean up sent keys from past dates to prevent unbounded growth
        const todayPrefix = departureIso;
        const freshSentKeys = sentKeys.filter((key) => key.includes(todayPrefix));
        if (freshSentKeys.length < sentKeys.length) {
          await deliveryRef.set({ sentKeys: freshSentKeys }, { merge: true });
        }

        // ─── Fixed Reminders (20, 15, 10, 5 min) ─────────────────
        const fixedOffsets: number[] = alert.fixedReminderMinutes || [20, 15, 10, 5];

        for (const offset of fixedOffsets) {
          if (!isWithinWindow(minsUntilDeparture, offset)) continue;

          const sentKey = `${scheduleId}:${departureIso}:fixed-${offset}`;
          if (sentKeys.includes(sentKey)) continue;
          if (!await reserveSentKey(userId, scheduleId, sentKey)) continue;

          // Fetch live train status
          let train: LiveTrain | null = null;
          if (apiKey && origin && destination) {
            train = await fetchLiveTrainStatus(origin, destination, departureTime, apiKey, originStopId, destinationStopId, alert.selectedTripId, alert.selectedPlatform);
          }

          // Format and send message
          const message = formatReminderMessage({
            title: alert.title || 'Train Alert',
            origin,
            destination,
            departureTime,
            offsetMinutes: offset,
            train,
          });

          const sent = await sendMessageWithRetry(botToken, chatId, message);
          if (sent) {
            sentKeys.push(sentKey);
            await updateDeliveryState(userId, scheduleId, train, delivery.lastKnownTripState);
          } else {
            await releaseSentKey(userId, scheduleId, sentKey);
          }
        }

        // ─── Change Checks (18, 13 min) ──────────────────────────
        const changeOffsets: number[] = alert.changeCheckMinutes || [18, 13];

        for (const offset of changeOffsets) {
          if (!isWithinWindow(minsUntilDeparture, offset)) continue;
          if (!apiKey || !origin || !destination) continue;

          const train = await fetchLiveTrainStatus(origin, destination, departureTime, apiKey, originStopId, destinationStopId, alert.selectedTripId, alert.selectedPlatform);
          if (!train) continue;

          const lastState = delivery.lastKnownTripState;
          if (!lastState) {
            // First check — store state, don't send message
            await deliveryRef.set({ sentKeys, lastKnownTripState: { estimatedTime: train.estimatedTime, platform: train.platform, status: train.status } }, { merge: true });
            continue;
          }

          // Detect changes
          let change = '';
          if (train.cancelled && lastState.status !== 'cancelled') {
            change = `❌ <b>Train CANCELLED</b>\nCheck the app for alternative services.`;
          } else if (train.status === 'delayed' && lastState.status !== 'delayed') {
            change = `⚠️ Train now <b>${train.delayMinutes || '?'} min late</b>`;
          } else if (train.platform && train.platform !== lastState.platform && lastState.platform) {
            change = `📍 Platform changed: ${lastState.platform} → <b>${train.platform}</b>`;
          }

          if (!change) continue;

          const changeSentKey = `${scheduleId}:${departureIso}:change-${offset}:${train.status}-${train.platform}`;
          if (sentKeys.includes(changeSentKey)) continue;
          if (!await reserveSentKey(userId, scheduleId, changeSentKey)) continue;

          const message = formatChangeMessage({
            title: alert.title || 'Train Alert',
            origin,
            destination,
            departureTime,
            change,
            train,
          });

          const sent = await sendMessageWithRetry(botToken, chatId, message);
          if (sent) {
            sentKeys.push(changeSentKey);
            await updateDeliveryState(userId, scheduleId, train, delivery.lastKnownTripState);
          } else {
            await releaseSentKey(userId, scheduleId, changeSentKey);
          }
        }
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    console.error('Alert scheduler error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Scheduler failed' }) };
  }
};

// Run every minute
export const handler = schedule('* * * * *', schedulerHandler);
