import type { Handler } from '@netlify/functions';
import { FieldValue } from 'firebase-admin/firestore';
import {
  getAlertSchedulesRef,
  getAlertDeliveryStateRef,
  getDb,
  getRouteCardsRef,
  getSettingsRef,
} from '../../lib/firestore';
import { sendMessageWithRetry } from '../../lib/telegram';
import { fetchRouteTrainDepartures, type RouteMode } from './routes-trains';

const NSW_TIME_ZONE = 'Australia/Sydney';
const DEFAULT_FIXED_REMINDERS = [25, 20, 10, 5];
const DEFAULT_DELAY_RECHECK_MINUTES = 2;
const DEFAULT_FALLBACK_WINDOW_MINUTES = 5;
const TRAIN_SUMMARY_LIMIT = 8;
const OTHER_TRAINS_LIMIT = 3;

type ApiRecord = Record<string, unknown>;

interface LiveTrain {
  tripId: string;
  route: string;
  destination: string;
  platform: string;
  scheduledTime: string;
  estimatedTime?: string;
  status: string;
  delayMinutes?: number;
  cancelled: boolean;
  diffMinutes: number;
  alerts: ServiceAlert[];
}

interface ServiceAlert {
  title: string;
  description: string;
}

interface RouteInfo {
  origin: string;
  destination: string;
  originStopId: string;
  destinationStopId: string;
  mode?: RouteMode;
}

interface DeliveryState {
  sentKeys?: string[];
  lastKnownTripState?: {
    tripId?: string;
    route?: string;
    destination?: string;
    scheduledTime?: string;
    estimatedTime?: string;
    platform?: string;
    status?: string;
    alertsHash?: string;
    replacementTripId?: string;
    replacementScheduledTime?: string;
  } | null;
}

interface ResolveOptions extends RouteInfo {
  apiKey: string;
  departureDate: Date;
  selectedTripId?: string;
  targetRoute?: string;
  fallbackWindowMinutes: number;
}

interface ResolvedWatch {
  target: LiveTrain | null;
  active: LiveTrain | null;
  replacement: LiveTrain | null;
  candidates: LiveTrain[];
}

// ─── Sydney-local date/time helpers ─────────────────────────────────

function getSydneyParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: NSW_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23',
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
}

function getSydneyDateKey(date: Date): string {
  const parts = getSydneyParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getSydneyWeekday(date: Date): number {
  const short = new Intl.DateTimeFormat('en-AU', { timeZone: NSW_TIME_ZONE, weekday: 'short' }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short);
}

function sydneyLocalDateTimeToUtc(dateKey: string, timeHHmm: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = timeHHmm.split(':').map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const parts = getSydneyParts(new Date(utcGuess));
  const zonedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    0,
    0
  );
  return new Date(utcGuess - (zonedAsUtc - utcGuess));
}

function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
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

function isWithinWindow(minutesUntilDeparture: number, targetMinutes: number): boolean {
  return minutesUntilDeparture >= targetMinutes - 1.5 && minutesUntilDeparture < targetMinutes + 0.5;
}

function fixedOffsetFromEvent(eventName?: string): number | null {
  const match = String(eventName || '').match(/^fixed-(\d+)$/);
  if (!match) return null;
  const offset = Number(match[1]);
  return Number.isFinite(offset) ? offset : null;
}

function dueFixedOffsets(
  minutesUntilDeparture: number,
  fixedOffsets: number[],
  eventName?: string
): number[] {
  const eventOffset = fixedOffsetFromEvent(eventName);
  if (eventOffset !== null && fixedOffsets.includes(eventOffset)) {
    return [eventOffset];
  }
  return fixedOffsets.filter((offset) => isWithinWindow(minutesUntilDeparture, offset));
}

function normalized(value?: string | null): string {
  return String(value || '').toLowerCase().replace(/\s+/g, '').trim();
}

function routeMatches(trainRoute: string, targetRoute?: string): boolean {
  if (!targetRoute) return true;
  const train = normalized(trainRoute);
  const target = normalized(targetRoute);
  return train === target || train.includes(target) || target.includes(train);
}

function appliesToday(alert: ApiRecord, now: Date): boolean {
  const todayKey = getSydneyDateKey(now);
  if (alert.oneTimeDate) return String(alert.oneTimeDate) === todayKey;

  const days = Array.isArray(alert.days) ? alert.days : [];
  return days.length > 0 && days.includes(getSydneyWeekday(now));
}

// ─── Train resolution and matching ──────────────────────────────────

async function fetchTrainCandidates(options: ResolveOptions): Promise<LiveTrain[]> {
  try {
    const departures = await fetchRouteTrainDepartures({
      apiKey: options.apiKey,
      origin: options.origin,
      destination: options.destination,
      originStopId: options.originStopId,
      destinationStopId: options.destinationStopId,
      mode: options.mode || 'train',
      limit: TRAIN_SUMMARY_LIMIT,
    });

    return departures.map((departure) => {
      const scheduledMs = new Date(departure.scheduledTime).getTime();
      const diffMinutes = Number.isNaN(scheduledMs)
        ? 0
        : Math.round((scheduledMs - options.departureDate.getTime()) / 60000);

      return {
        tripId: departure.tripId,
        route: departure.route,
        destination: departure.destination || options.destination,
        platform: departure.platform,
        scheduledTime: departure.scheduledTime,
        estimatedTime: departure.estimatedTime,
        status: departure.status,
        delayMinutes: departure.delayMinutes,
        cancelled: departure.cancelled,
        diffMinutes,
        alerts: departure.alerts.map((alert) => ({
          title: alert.title,
          description: alert.description,
        })),
      };
    }).filter((train) => {
      const scheduledMs = new Date(train.scheduledTime).getTime();
      return !Number.isNaN(scheduledMs);
    }).sort((a, b) => Math.abs(a.diffMinutes) - Math.abs(b.diffMinutes));
  } catch {
    return [];
  }
}

function scoreCandidate(train: LiveTrain, options: ResolveOptions): number {
  // MUST match destination — reject if train doesn't go where user wants
  // Strongly prefer the train closest to the user's set departure time
  const timePenalty = Math.abs(train.diffMinutes) * 10;
  let score = 100 - timePenalty;

  // Exact time match (within 1 min) gets massive bonus
  if (Math.abs(train.diffMinutes) <= 1) score += 80;

  // Route match
  if (options.targetRoute && routeMatches(train.route, options.targetRoute)) score += 40;

  // Trip ID match (same service from when user tapped bell)
  if (options.selectedTripId && train.tripId && train.tripId === options.selectedTripId) score += 10;

  // Cancelled trains score lower
  if (train.cancelled) score -= 30;

  return score;
}

function findReplacement(candidates: LiveTrain[], target: LiveTrain, options: ResolveOptions): LiveTrain | null {
  const replacement = candidates
    .filter((train) => !train.cancelled)
    .filter((train) => train.scheduledTime !== target.scheduledTime || train.tripId !== target.tripId)
    .filter((train) => train.diffMinutes >= 0 && train.diffMinutes <= options.fallbackWindowMinutes)
    .filter((train) => routeMatches(train.route, target.route || options.targetRoute))
    .filter((train) => !target.platform || train.platform === target.platform)
    .sort((a, b) => a.diffMinutes - b.diffMinutes)[0];

  return replacement || null;
}

async function resolveWatchedTrain(options: ResolveOptions): Promise<ResolvedWatch> {
  const candidates = await fetchTrainCandidates(options);
  if (candidates.length === 0) return { target: null, active: null, replacement: null, candidates: [] };

  // Pick the closest destination-matching train from the fetched window. Do not
  // reject wider gaps here; sparse services can legitimately be 15+ min apart.
  const validCandidates = candidates;
  if (validCandidates.length === 0) return { target: null, active: null, replacement: null, candidates };

  const target = [...validCandidates].sort((a, b) => scoreCandidate(b, options) - scoreCandidate(a, options))[0];
  const replacement = target.cancelled ? findReplacement(validCandidates, target, options) : null;

  return {
    target,
    active: replacement || target,
    replacement,
    candidates: validCandidates,
  };
}

// ─── Delivery state ─────────────────────────────────────────────────

async function reserveSentKey(userId: string, scheduleId: string, sentKey: string): Promise<boolean> {
  const deliveryRef = getAlertDeliveryStateRef(userId).doc(scheduleId);
  return getDb().runTransaction(async (transaction) => {
    const deliveryDoc = await transaction.get(deliveryRef);
    const sentKeys = (deliveryDoc.data()?.sentKeys || []) as string[];
    if (sentKeys.includes(sentKey)) return false;

    transaction.set(deliveryRef, { sentKeys: [...sentKeys, sentKey] }, { merge: true });
    return true;
  });
}

async function releaseSentKey(userId: string, scheduleId: string, sentKey: string): Promise<void> {
  await getAlertDeliveryStateRef(userId).doc(scheduleId).set({
    sentKeys: FieldValue.arrayRemove(sentKey),
  }, { merge: true });
}

async function updateDeliveryState(userId: string, scheduleId: string, watch: ResolvedWatch): Promise<void> {
  const train = watch.active || watch.target;
  await getAlertDeliveryStateRef(userId).doc(scheduleId).set({
    lastKnownTripState: train ? {
      tripId: train.tripId,
      route: train.route,
      destination: train.destination,
      scheduledTime: train.scheduledTime,
      estimatedTime: train.estimatedTime,
      platform: train.platform,
      status: train.status,
      alertsHash: alertsHash(train),
      replacementTripId: watch.replacement?.tripId,
      replacementScheduledTime: watch.replacement?.scheduledTime,
    } : null,
  }, { merge: true });
}

// ─── Message Formatting ─────────────────────────────────────────────

function shortStop(name: string): string {
  return name.replace(/\s*(Station|Wharf|Light Rail)\s*/gi, '').replace(/,.*$/, '').trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function trainTime(train: LiveTrain | null, fallbackTime: string): string {
  if (train) {
    const realTime = train.estimatedTime || train.scheduledTime;
    const formatted = formatIsoSydneyTime(realTime);
    if (formatted) return formatted;
  }
  return formatTime12h(fallbackTime);
}

function trainPlatform(train: LiveTrain | null): string {
  if (train?.platform) return train.platform;
  return '';
}

function statusText(train: LiveTrain | null): string {
  if (!train) return 'Live data unavailable';
  if (train.cancelled || train.status === 'cancelled') return 'Cancelled';
  if (train.status === 'delayed' && train.delayMinutes) return `Delayed ${train.delayMinutes} min`;
  if (train.status === 'on-time') return 'On time';
  return train.status || 'Unknown';
}

function alertsHash(train: LiveTrain | null): string {
  if (!train) return '';
  return train.alerts
    .map((alert) => `${alert.title}|${alert.description}`)
    .join('||')
    .slice(0, 1000);
}

function trainIdentity(train: LiveTrain): string {
  return train.tripId || `${train.scheduledTime}:${train.platform}:${train.route}`;
}

function sortedSummaryTrains(watch: ResolvedWatch): LiveTrain[] {
  const byKey = new Map<string, LiveTrain>();
  for (const train of watch.candidates) byKey.set(trainIdentity(train), train);
  if (watch.active) byKey.set(trainIdentity(watch.active), watch.active);

  return [...byKey.values()]
    .sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime())
    .slice(0, TRAIN_SUMMARY_LIMIT);
}

function hasMeaningfulChange(previous: DeliveryState['lastKnownTripState'], train: LiveTrain): boolean {
  if (!previous) return false;
  return previous.tripId !== train.tripId ||
    previous.scheduledTime !== train.scheduledTime ||
    previous.estimatedTime !== train.estimatedTime ||
    previous.platform !== train.platform ||
    previous.status !== train.status ||
    previous.alertsHash !== alertsHash(train);
}

function isRecheckMinute(minutesUntilDeparture: number, recheckEvery: number): boolean {
  if (recheckEvery <= 0) return false;
  if (minutesUntilDeparture <= 10 || minutesUntilDeparture >= 20) return false;
  const rounded = Math.round(minutesUntilDeparture);
  if (Math.abs(minutesUntilDeparture - rounded) > 0.75) return false;
  return rounded % recheckEvery === 0;
}

function standardMessage(opts: {
  origin: string;
  destination: string;
  time: string;
  platform: string;
  alert?: string;
  status?: string;
  others?: LiveTrain[];
  primary?: LiveTrain | null;
}): string {
  const lines = [
    `<b>${escapeHtml(shortStop(opts.origin))} to ${escapeHtml(shortStop(opts.destination))}</b>`,
    `At: <b>${escapeHtml(opts.time)}</b>`,
  ];
  if (opts.platform) lines.push(`Platform: <b>${escapeHtml(opts.platform)}</b>`);
  lines.push(`Status: ${escapeHtml(opts.status || 'Live data unavailable')}`);
  if (opts.alert) lines.push(`Alert: ${escapeHtml(opts.alert)}`);

  const otherTrains = (opts.others || [])
    .filter((train) => !opts.primary || trainIdentity(train) !== trainIdentity(opts.primary))
    .slice(0, OTHER_TRAINS_LIMIT);

  if (otherTrains.length > 0) {
    lines.push('');
    lines.push('Other trains:');
    for (const train of otherTrains) {
      const platform = trainPlatform(train) || 'TBC';
      lines.push(`${trainTime(train, train.scheduledTime)} - Platform ${escapeHtml(platform)} - ${escapeHtml(statusText(train))}`);
    }
  }

  return lines.join('\n');
}

function serviceAlertText(train: LiveTrain | null): string | undefined {
  const serviceAlert = train?.alerts.find((alert) => alert.title || alert.description);
  if (serviceAlert) {
    return [serviceAlert.title, serviceAlert.description]
      .filter(Boolean)
      .join(' - ')
      .slice(0, 500);
  }
  if (train?.cancelled) return 'Cancelled';
  if (train?.status === 'delayed' && train.delayMinutes) return `Delayed ${train.delayMinutes} min`;
  return undefined;
}

function formatReminderMessage(opts: {
  title: string;
  origin: string;
  destination: string;
  departureTime: string;
  offsetMinutes: number;
  watch: ResolvedWatch;
}): string {
  const { origin, destination, departureTime, watch } = opts;
  const train = watch.active;

  // Always use the real train time from API, not the saved alert time
  return standardMessage({
    origin,
    destination,
    time: trainTime(train, departureTime),
    platform: trainPlatform(train),
    alert: serviceAlertText(train) || (!train
      ? 'TfNSW did not return matching live train data. This alert will keep checking.'
      : undefined),
    status: statusText(train),
    primary: train,
    others: sortedSummaryTrains(watch),
  });
}


function formatUpdateMessage(opts: {
  title: string;
  origin: string;
  destination: string;
  departureTime: string;
  watch: ResolvedWatch;
}): string {
  const { origin, destination, departureTime, watch } = opts;
  const train = watch.active;

  return standardMessage({
    origin,
    destination,
    time: trainTime(train, departureTime),
    platform: trainPlatform(train),
    alert: serviceAlertText(train),
    status: statusText(train),
    primary: train,
    others: sortedSummaryTrains(watch),
  });
}

function formatCancellationMessage(opts: {
  title: string;
  origin: string;
  destination: string;
  target: LiveTrain;
  replacement: LiveTrain | null;
}): string {
  const { origin, destination, target, replacement } = opts;
  const alert = serviceAlertText(target) || (replacement
    ? `Cancelled. Replacement at ${formatIsoSydneyTime(replacement.estimatedTime || replacement.scheduledTime)} on platform ${trainPlatform(replacement) || 'TBC'}`
    : 'Cancelled. No close replacement found');

  return standardMessage({
    origin,
    destination,
    time: trainTime(target, target.scheduledTime),
    platform: trainPlatform(target),
    alert,
    status: statusText(target),
  });
}

async function sendReservedMessage(opts: {
  userId: string;
  scheduleId: string;
  sentKey: string;
  botToken: string;
  chatId: string;
  message: string;
}): Promise<boolean> {
  const { userId, scheduleId, sentKey, botToken, chatId, message } = opts;
  if (!await reserveSentKey(userId, scheduleId, sentKey)) return false;
  const sent = await sendMessageWithRetry(botToken, chatId, message);
  if (!sent) {
    await releaseSentKey(userId, scheduleId, sentKey);
    return false;
  }

  await getAlertDeliveryStateRef(userId).doc(scheduleId).set({
    activity: FieldValue.arrayUnion({
      sentAt: new Date().toISOString(),
      sentKey,
      message,
      source: 'scheduler',
    }),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  return sent;
}

async function routeInfoForSchedule(userId: string, routeCardId: string): Promise<RouteInfo | null> {
  if (!routeCardId) return null;
  const cardDoc = await getRouteCardsRef(userId).doc(routeCardId).get();
  if (!cardDoc.exists) return null;
  const cardData = cardDoc.data()!;
  return {
    origin: cardData.origin || '',
    destination: cardData.destination || '',
    originStopId: cardData.originStopId || '',
    destinationStopId: cardData.destinationStopId || '',
    mode: cardData.mode || 'train',
  };
}

export async function runAlertSchedulerForSchedule(
  userId: string,
  scheduleId: string,
  eventName?: string
): Promise<void> {
  const apiKey = process.env.TFN_API_KEY;
  if (!apiKey) return;

  const scheduleDoc = await getAlertSchedulesRef(userId).doc(scheduleId).get();
  if (!scheduleDoc.exists) return;

  const alert = scheduleDoc.data() as ApiRecord;
  if (alert.enabled !== true) return;

  const settingsDoc = await getSettingsRef(userId).get();
  const settings = settingsDoc.data();
  const botToken = settings?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = settings?.telegramChatId || process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  const now = new Date();
  const todayKey = getSydneyDateKey(now);
  const departureTime = String(alert.departureTime || '');
  if (!departureTime || !appliesToday(alert, now)) return;

  const departureDate = sydneyLocalDateTimeToUtc(todayKey, departureTime);
  const minsUntilDeparture = (departureDate.getTime() - now.getTime()) / 60000;
  const fixedOffsets = (Array.isArray(alert.fixedReminderMinutes) && alert.fixedReminderMinutes.length > 0)
    ? alert.fixedReminderMinutes.filter((value): value is number => typeof value === 'number')
    : DEFAULT_FIXED_REMINDERS;
  const delayRecheckMinutes = typeof alert.delayRecheckMinutes === 'number' ? alert.delayRecheckMinutes : DEFAULT_DELAY_RECHECK_MINUTES;
  const fallbackWindowMinutes = typeof alert.fallbackWindowMinutes === 'number' ? alert.fallbackWindowMinutes : DEFAULT_FALLBACK_WINDOW_MINUTES;
  const maxWatchMinutes = Math.max(...fixedOffsets, 25);

  if (minsUntilDeparture < -1 || minsUntilDeparture > maxWatchMinutes + 1) return;

  const routeInfo = await routeInfoForSchedule(userId, String(alert.routeCardId || ''));
  if (!routeInfo || !routeInfo.origin || !routeInfo.destination) return;

  const deliveryRef = getAlertDeliveryStateRef(userId).doc(scheduleId);
  const deliveryDoc = await deliveryRef.get();
  const delivery = (deliveryDoc.data() || { sentKeys: [], lastKnownTripState: null }) as DeliveryState;
  const sentKeys = delivery.sentKeys || [];
  const freshSentKeys = sentKeys.filter((key) => key.includes(todayKey));
  if (freshSentKeys.length < sentKeys.length) await deliveryRef.set({ sentKeys: freshSentKeys }, { merge: true });

  const watch = await resolveWatchedTrain({
    apiKey,
    ...routeInfo,
    departureDate,
    selectedTripId: String(alert.selectedTripId || ''),
    targetRoute: String(alert.targetRoute || ''),
    fallbackWindowMinutes,
  });

  const previousState = delivery.lastKnownTripState;
  await updateDeliveryState(userId, scheduleId, watch);

  if (watch.target?.cancelled && alert.notifyOnCancellationImmediately !== false) {
    const sentKey = `${scheduleId}:${todayKey}:cancelled:${watch.target.tripId || watch.target.scheduledTime}`;
    await sendReservedMessage({
      userId,
      scheduleId,
      sentKey,
      botToken,
      chatId,
      message: formatCancellationMessage({
        title: String(alert.title || 'Train Alert'),
        origin: routeInfo.origin,
        destination: routeInfo.destination,
        target: watch.target,
        replacement: watch.replacement,
      }),
    });
  }

  const activeTrain = watch.active;

  for (const offset of dueFixedOffsets(minsUntilDeparture, fixedOffsets, eventName)) {
    const trainKey = activeTrain?.tripId || activeTrain?.scheduledTime || 'live-unavailable';
    const sentKey = `${scheduleId}:${todayKey}:fixed-${offset}:${trainKey}`;
    await sendReservedMessage({
      userId,
      scheduleId,
      sentKey,
      botToken,
      chatId,
      message: formatReminderMessage({
        title: String(alert.title || 'Train Alert'),
        origin: routeInfo.origin,
        destination: routeInfo.destination,
        departureTime,
        offsetMinutes: offset,
        watch,
      }),
    });
  }

  if (
    activeTrain &&
    isRecheckMinute(minsUntilDeparture, delayRecheckMinutes) &&
    hasMeaningfulChange(previousState, activeTrain)
  ) {
    const bucket = Math.floor(now.getTime() / (delayRecheckMinutes * 60 * 1000));
    const sentKey = `${scheduleId}:${todayKey}:recheck-${bucket}:${activeTrain.tripId || activeTrain.scheduledTime}:${activeTrain.status}:${activeTrain.delayMinutes || 0}`;
    await sendReservedMessage({
      userId,
      scheduleId,
      sentKey,
      botToken,
      chatId,
      message: formatUpdateMessage({
        title: String(alert.title || 'Train Alert'),
        origin: routeInfo.origin,
        destination: routeInfo.destination,
        departureTime,
        watch,
      }),
    });
  }
}

// ─── Main Scheduler ─────────────────────────────────────────────────

export const runAlertScheduler: Handler = async () => {
  const apiKey = process.env.TFN_API_KEY;

  try {
    const usersSnapshot = await getDb().collection('users').get();

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const schedulesSnapshot = await getAlertSchedulesRef(userId)
        .where('enabled', '==', true)
        .get();

      if (schedulesSnapshot.empty) continue;

      const settingsDoc = await getSettingsRef(userId).get();
      const settings = settingsDoc.data();
      const botToken = settings?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
      const chatId = settings?.telegramChatId || process.env.TELEGRAM_CHAT_ID;
      if (!botToken || !chatId) continue;

      const now = new Date();
      const todayKey = getSydneyDateKey(now);

      for (const scheduleDoc of schedulesSnapshot.docs) {
        const alert = scheduleDoc.data() as ApiRecord;
        const scheduleId = scheduleDoc.id;
        const departureTime = String(alert.departureTime || '');
        if (!departureTime || !appliesToday(alert, now)) continue;

        const departureDate = sydneyLocalDateTimeToUtc(todayKey, departureTime);
        const minsUntilDeparture = (departureDate.getTime() - now.getTime()) / 60000;
        const fixedOffsets = (Array.isArray(alert.fixedReminderMinutes) && alert.fixedReminderMinutes.length > 0)
          ? alert.fixedReminderMinutes.filter((value): value is number => typeof value === 'number')
          : DEFAULT_FIXED_REMINDERS;
        const delayRecheckMinutes = typeof alert.delayRecheckMinutes === 'number' ? alert.delayRecheckMinutes : DEFAULT_DELAY_RECHECK_MINUTES;
        const fallbackWindowMinutes = typeof alert.fallbackWindowMinutes === 'number' ? alert.fallbackWindowMinutes : DEFAULT_FALLBACK_WINDOW_MINUTES;
        const maxWatchMinutes = Math.max(...fixedOffsets, 25);

        if (minsUntilDeparture < -1 || minsUntilDeparture > maxWatchMinutes + 1) continue;
        if (!apiKey) continue;

        const routeInfo = await routeInfoForSchedule(userId, String(alert.routeCardId || ''));
        if (!routeInfo || !routeInfo.origin || !routeInfo.destination) continue;

        const deliveryRef = getAlertDeliveryStateRef(userId).doc(scheduleId);
        const deliveryDoc = await deliveryRef.get();
        const delivery = (deliveryDoc.data() || { sentKeys: [], lastKnownTripState: null }) as DeliveryState;
        const sentKeys = delivery.sentKeys || [];
        const freshSentKeys = sentKeys.filter((key) => key.includes(todayKey));
        if (freshSentKeys.length < sentKeys.length) await deliveryRef.set({ sentKeys: freshSentKeys }, { merge: true });

        const watch = await resolveWatchedTrain({
          apiKey,
          ...routeInfo,
          departureDate,
          selectedTripId: String(alert.selectedTripId || ''),
          targetRoute: String(alert.targetRoute || ''),
          fallbackWindowMinutes,
        });

        const previousState = delivery.lastKnownTripState;
        await updateDeliveryState(userId, scheduleId, watch);

        if (watch.target?.cancelled && alert.notifyOnCancellationImmediately !== false) {
          const sentKey = `${scheduleId}:${todayKey}:cancelled:${watch.target.tripId || watch.target.scheduledTime}`;
          await sendReservedMessage({
            userId,
            scheduleId,
            sentKey,
            botToken,
            chatId,
            message: formatCancellationMessage({
              title: String(alert.title || 'Train Alert'),
              origin: routeInfo.origin,
              destination: routeInfo.destination,
              target: watch.target,
              replacement: watch.replacement,
            }),
          });
        }

        const activeTrain = watch.active;

        for (const offset of dueFixedOffsets(minsUntilDeparture, fixedOffsets)) {
          const trainKey = activeTrain?.tripId || activeTrain?.scheduledTime || 'live-unavailable';
          const sentKey = `${scheduleId}:${todayKey}:fixed-${offset}:${trainKey}`;
          await sendReservedMessage({
            userId,
            scheduleId,
            sentKey,
            botToken,
            chatId,
            message: formatReminderMessage({
              title: String(alert.title || 'Train Alert'),
              origin: routeInfo.origin,
              destination: routeInfo.destination,
              departureTime,
              offsetMinutes: offset,
              watch,
            }),
          });
        }

        if (
          activeTrain &&
          isRecheckMinute(minsUntilDeparture, delayRecheckMinutes) &&
          hasMeaningfulChange(previousState, activeTrain)
        ) {
          const bucket = Math.floor(now.getTime() / (delayRecheckMinutes * 60 * 1000));
          const sentKey = `${scheduleId}:${todayKey}:recheck-${bucket}:${activeTrain.tripId || activeTrain.scheduledTime}:${activeTrain.status}:${activeTrain.delayMinutes || 0}`;
          await sendReservedMessage({
            userId,
            scheduleId,
            sentKey,
            botToken,
            chatId,
            message: formatUpdateMessage({
              title: String(alert.title || 'Train Alert'),
              origin: routeInfo.origin,
              destination: routeInfo.destination,
              departureTime,
              watch,
            }),
          });
        }
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    console.error('Alert scheduler error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Scheduler failed' }) };
  }
};

export const handler: Handler = async () => ({
  statusCode: 200,
  body: JSON.stringify({
    ok: true,
    disabled: true,
    message: 'Use alert-scheduler-run for Cloudflare-triggered dispatch.',
  }),
});
