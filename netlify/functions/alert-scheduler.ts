import type { Handler } from '@netlify/functions';
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

const NSW_TIME_ZONE = 'Australia/Sydney';
const DEFAULT_FIXED_REMINDERS = [25, 20, 10, 5];
const DEFAULT_DELAY_RECHECK_MINUTES = 2;
const DEFAULT_FALLBACK_WINDOW_MINUTES = 5;
const NEAREST_TRAIN_SEARCH_WINDOW_MINUTES = 15;

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
}

interface DeliveryState {
  sentKeys?: string[];
  lastKnownTripState?: {
    tripId?: string;
    route?: string;
    destination?: string;
    estimatedTime?: string;
    platform?: string;
    status?: string;
    replacementTripId?: string;
    replacementScheduledTime?: string;
  } | null;
}

interface ResolveOptions extends RouteInfo {
  apiKey: string;
  departureDate: Date;
  selectedTripId?: string;
  selectedPlatform?: string;
  targetRoute?: string;
  targetDestination?: string;
  fallbackWindowMinutes: number;
}

interface ResolvedWatch {
  target: LiveTrain | null;
  active: LiveTrain | null;
  replacement: LiveTrain | null;
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

function buildTripPlannerTimeParams(date: Date): string {
  const parts = getSydneyParts(date);
  return `&itdDate=${parts.year}${parts.month}${parts.day}&itdTime=${parts.hour}${parts.minute}`;
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

function cleanName(name: string): string {
  return name.toLowerCase().replace(/\s*(station|wharf|light rail)\s*/gi, '').replace(/,.*$/, '').trim();
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

function destinationMatches(trainDestination: string, targetDestination?: string): boolean {
  if (!targetDestination) return true;
  const train = cleanName(trainDestination);
  const target = cleanName(targetDestination);
  return train === target || train.includes(target) || target.includes(train);
}

function extractPlatform(originInfo: ApiRecord): string {
  const props = (originInfo.properties || {}) as Record<string, string>;
  const platformName = props.plannedPlatformName || props.platformName || '';
  if (platformName) {
    const match = platformName.match(/(\d+|[A-Z])$/i);
    return match ? match[1] : platformName;
  }

  const stoppingPoint = props.stoppingPointPlanned || '';
  if (stoppingPoint) {
    const match = stoppingPoint.match(/(\d+|[A-Z])$/i);
    return match ? match[1] : '';
  }

  const disassembled = String(originInfo.disassembledName || '');
  const platMatch = disassembled.match(/[Pp]latform\s*(\d+|[A-Z])/);
  if (platMatch) return platMatch[1];

  const area = props.area || '';
  if (area && /^\d+$/.test(area) && Number(area) > 0 && Number(area) <= 30) {
    return area;
  }

  return '';
}

function parseServiceAlerts(infos: ApiRecord[]): ServiceAlert[] {
  const alerts: ServiceAlert[] = [];
  for (const info of infos.slice(0, 3)) {
    const title = String(info.title || info.subtitle || '').trim();
    const description = String(info.content || info.description || '').trim();
    if (!title && !description) continue;
    alerts.push({
      title: title || description.slice(0, 80),
      description,
    });
  }
  return alerts;
}

function appliesToday(alert: ApiRecord, now: Date): boolean {
  const todayKey = getSydneyDateKey(now);
  if (alert.oneTimeDate) return String(alert.oneTimeDate) === todayKey;

  const days = Array.isArray(alert.days) ? alert.days : [];
  return days.length > 0 && days.includes(getSydneyWeekday(now));
}

// ─── Train resolution and matching ──────────────────────────────────

async function fetchTrainCandidates(options: ResolveOptions): Promise<LiveTrain[]> {
  const {
    apiKey,
    origin,
    destination,
    originStopId,
    destinationStopId,
    departureDate,
  } = options;

  try {
    const queryDate = new Date(departureDate.getTime() - NEAREST_TRAIN_SEARCH_WINDOW_MINUTES * 60 * 1000);
    const originType = originStopId ? 'stop' : 'any';
    const originName = originStopId || origin;
    const destinationType = destinationStopId ? 'stop' : 'any';
    const destinationName = destinationStopId || destination;
    const timeParams = buildTripPlannerTimeParams(queryDate);
    const url = `https://api.transport.nsw.gov.au/v1/tp/trip` +
      `?outputFormat=rapidJSON` +
      `&coordOutputFormat=EPSG%3A4326` +
      `&depArrMacro=dep` +
      `&type_origin=${originType}` +
      `&name_origin=${encodeURIComponent(originName)}` +
      `&type_destination=${destinationType}` +
      `&name_destination=${encodeURIComponent(destinationName)}` +
      `&calcNumberOfTrips=12` +
      `&TfNSWTR=true` +
      `&version=10.2.1.42` +
      timeParams;

    const res = await fetchWithTimeout(url, { headers: { Authorization: `apikey ${apiKey}` } });
    if (!res.ok) return [];

    const data = (await res.json()) as ApiRecord;
    const journeys = (data?.journeys || []) as ApiRecord[];
    const seen = new Set<string>();
    const candidates: LiveTrain[] = [];

    for (const journey of journeys) {
      const legs = (journey.legs || []) as ApiRecord[];
      const transitLegs = legs.filter((candidate) => {
        const candidateTransportation = (candidate.transportation || {}) as ApiRecord;
        const candidateProduct = (candidateTransportation.product || {}) as ApiRecord;
        return Number(candidateProduct.class) !== 100;
      });
      if (transitLegs.length === 0) continue;

      const leg = transitLegs[0];
      const transportation = (leg.transportation || {}) as ApiRecord;
      const originInfo = (leg.origin || {}) as ApiRecord;
      const scheduledTime = String(originInfo.departureTimePlanned || '');
      if (!scheduledTime) continue;

      const scheduledMs = new Date(scheduledTime).getTime();
      if (Number.isNaN(scheduledMs)) continue;

      const diffMinutes = Math.round((scheduledMs - departureDate.getTime()) / 60000);
      if (Math.abs(diffMinutes) > NEAREST_TRAIN_SEARCH_WINDOW_MINUTES) continue;

      const tripId = String(transportation.id || '');
      const route = String(transportation.disassembledName || transportation.number || '');
      const transportDest = (transportation.destination || {}) as ApiRecord;
      const trainDestination = String(transportDest.name || destination).replace(/,.*$/, '');
      const platform = extractPlatform(originInfo);
      const estimatedTimeRaw = String(originInfo.departureTimeEstimated || '');
      const estimatedTime = estimatedTimeRaw || undefined;
      const cancelled = leg.isCancelled === true;
      const { status, delayMinutes } = getTimingStatus(scheduledTime, estimatedTime, cancelled);
      const alerts = parseServiceAlerts((journey.infos || []) as ApiRecord[]);
      const key = `${tripId}:${scheduledTime}:${platform}`;
      if (seen.has(key)) continue;
      seen.add(key);

      candidates.push({
        tripId,
        route,
        destination: trainDestination,
        platform,
        scheduledTime,
        estimatedTime,
        status,
        delayMinutes,
        cancelled,
        diffMinutes,
        alerts,
      });
    }

    const enriched = await enrichPlatformsFromDepartureMonitor(candidates, options);
    return enriched.sort((a, b) => Math.abs(a.diffMinutes) - Math.abs(b.diffMinutes));
  } catch {
    return [];
  }
}

async function enrichPlatformsFromDepartureMonitor(candidates: LiveTrain[], options: ResolveOptions): Promise<LiveTrain[]> {
  if (candidates.length === 0) return candidates;

  try {
    const dmType = options.originStopId ? 'stop' : 'any';
    const dmName = options.originStopId || options.origin;
    const dmUrl = `https://api.transport.nsw.gov.au/v1/tp/departure_mon` +
      `?outputFormat=rapidJSON` +
      `&coordOutputFormat=EPSG%3A4326` +
      `&mode=direct` +
      `&type_dm=${dmType}` +
      `&name_dm=${encodeURIComponent(dmName)}` +
      `&departureMonitorMacro=true` +
      `&TfNSWDM=true` +
      `&version=10.2.1.42` +
      `&limit=80`;

    const res = await fetchWithTimeout(dmUrl, { headers: { Authorization: `apikey ${options.apiKey}` } });
    if (!res.ok) return candidates;

    const data = (await res.json()) as ApiRecord;
    const events = ((data.stopEvents || []) as ApiRecord[]).map((event) => {
      const transportation = (event.transportation || {}) as ApiRecord;
      const destination = (transportation.destination || {}) as ApiRecord;
      return {
        tripId: String(transportation.id || ''),
        route: String(transportation.disassembledName || transportation.number || ''),
        destination: String(destination.name || '').replace(/,.*$/, ''),
        scheduledTime: String(event.departureTimePlanned || ''),
        estimatedTime: String(event.departureTimeEstimated || '') || undefined,
        platform: extractPlatform((event.location || {}) as ApiRecord),
        cancelled: event.isCancelled === true,
        alerts: parseServiceAlerts((event.infos || []) as ApiRecord[]),
      };
    });

    return candidates.map((candidate) => {
      const match = events.find((event) => {
        const sameTrip = candidate.tripId && event.tripId && candidate.tripId === event.tripId;
        const timeDiff = Math.abs(new Date(event.scheduledTime).getTime() - new Date(candidate.scheduledTime).getTime()) / 60000;
        const sameService = timeDiff <= 2 &&
          routeMatches(event.route, candidate.route) &&
          destinationMatches(event.destination || candidate.destination, candidate.destination || options.destination);
        return sameTrip || sameService;
      });

      if (!match) return candidate;
      return {
        ...candidate,
        platform: match.platform || candidate.platform,
        estimatedTime: match.estimatedTime || candidate.estimatedTime,
        cancelled: match.cancelled || candidate.cancelled,
        alerts: match.alerts.length > 0 ? match.alerts : candidate.alerts,
      };
    });
  } catch {
    return candidates;
  }
}

function scoreCandidate(train: LiveTrain, options: ResolveOptions): number {
  let score = Math.max(0, 40 - Math.abs(train.diffMinutes) * 4);
  if (options.targetRoute && routeMatches(train.route, options.targetRoute)) score += 60;
  if (destinationMatches(train.destination, options.targetDestination || options.destination)) score += 40;
  if (options.selectedPlatform && train.platform === options.selectedPlatform) score += 30;
  if (options.selectedTripId && train.tripId && train.tripId === options.selectedTripId) score += 20;
  if (train.cancelled) score -= 5;
  return score;
}

function findReplacement(candidates: LiveTrain[], target: LiveTrain, options: ResolveOptions): LiveTrain | null {
  const replacement = candidates
    .filter((train) => !train.cancelled)
    .filter((train) => train.scheduledTime !== target.scheduledTime || train.tripId !== target.tripId)
    .filter((train) => train.diffMinutes >= 0 && train.diffMinutes <= options.fallbackWindowMinutes)
    .filter((train) => routeMatches(train.route, target.route || options.targetRoute))
    .filter((train) => destinationMatches(train.destination, target.destination || options.targetDestination || options.destination))
    .filter((train) => !target.platform || train.platform === target.platform)
    .sort((a, b) => a.diffMinutes - b.diffMinutes)[0];

  return replacement || null;
}

async function resolveWatchedTrain(options: ResolveOptions): Promise<ResolvedWatch> {
  const candidates = await fetchTrainCandidates(options);
  if (candidates.length === 0) return { target: null, active: null, replacement: null };

  const target = [...candidates].sort((a, b) => scoreCandidate(b, options) - scoreCandidate(a, options))[0];
  const replacement = target.cancelled ? findReplacement(candidates, target, options) : null;

  return {
    target,
    active: replacement || target,
    replacement,
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
      estimatedTime: train.estimatedTime,
      platform: train.platform,
      status: train.status,
      replacementTripId: watch.replacement?.tripId,
      replacementScheduledTime: watch.replacement?.scheduledTime,
    } : null,
  }, { merge: true });
}

// ─── Message Formatting ─────────────────────────────────────────────

function shortStop(name: string): string {
  return name.replace(/\s*(Station|Wharf|Light Rail)\s*/gi, '').replace(/,.*$/, '').trim();
}

function trainTime(train: LiveTrain | null, fallbackTime: string): string {
  return train ? formatIsoSydneyTime(train.estimatedTime || train.scheduledTime) : formatTime12h(fallbackTime);
}

function trainPlatform(train: LiveTrain | null, fallbackPlatform = ''): string {
  return train?.platform || fallbackPlatform || 'TBC';
}

function standardMessage(opts: {
  origin: string;
  destination: string;
  time: string;
  platform: string;
  alert?: string;
}): string {
  const lines = [
    `<b>${shortStop(opts.origin)} to ${shortStop(opts.destination)}</b>`,
    `At: <b>${opts.time}</b>`,
    `Platform: <b>${opts.platform}</b>`,
  ];
  if (opts.alert) lines.push(`Alert: ${opts.alert}`);
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
  train: LiveTrain | null;
  fallbackPlatform?: string;
}): string {
  const { origin, destination, departureTime, train, fallbackPlatform } = opts;

  return standardMessage({
    origin,
    destination,
    time: trainTime(train, departureTime),
    platform: trainPlatform(train, fallbackPlatform),
    alert: serviceAlertText(train),
  });
}


function formatAvailabilityMessage(opts: {
  title: string;
  origin: string;
  destination: string;
  departureTime: string;
  train: LiveTrain | null;
  fallbackPlatform?: string;
}): string {
  const { origin, destination, departureTime, train, fallbackPlatform } = opts;

  return standardMessage({
    origin,
    destination,
    time: trainTime(train, departureTime),
    platform: trainPlatform(train, fallbackPlatform),
    alert: serviceAlertText(train),
  });
}

function formatCancellationMessage(opts: {
  title: string;
  origin: string;
  destination: string;
  target: LiveTrain;
  replacement: LiveTrain | null;
  fallbackPlatform?: string;
}): string {
  const { origin, destination, target, replacement, fallbackPlatform } = opts;
  const alert = serviceAlertText(target) || (replacement
    ? `Cancelled. Replacement at ${formatIsoSydneyTime(replacement.estimatedTime || replacement.scheduledTime)} on platform ${trainPlatform(replacement, fallbackPlatform)}`
    : 'Cancelled. No close replacement found');

  return standardMessage({
    origin,
    destination,
    time: trainTime(target, target.scheduledTime),
    platform: trainPlatform(target, fallbackPlatform),
    alert,
  });
}

function formatDelayMessage(opts: {
  title: string;
  origin: string;
  destination: string;
  train: LiveTrain;
  fallbackPlatform?: string;
}): string {
  const { origin, destination, train, fallbackPlatform } = opts;
  return standardMessage({
    origin,
    destination,
    time: trainTime(train, train.scheduledTime),
    platform: trainPlatform(train, fallbackPlatform),
    alert: serviceAlertText(train),
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
  };
}

export async function runAlertSchedulerForSchedule(userId: string, scheduleId: string): Promise<void> {
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

  const selectedPlatform = String(alert.selectedPlatform || '');
  const watch = await resolveWatchedTrain({
    apiKey,
    ...routeInfo,
    departureDate,
    selectedTripId: String(alert.selectedTripId || ''),
    selectedPlatform,
    targetRoute: String(alert.targetRoute || ''),
    targetDestination: String(alert.targetDestination || routeInfo.destination),
    fallbackWindowMinutes,
  });

  await updateDeliveryState(userId, scheduleId, watch);

  if (minsUntilDeparture >= -0.5 && minsUntilDeparture <= maxWatchMinutes + 1) {
    const activeKey = watch.active?.tripId || watch.active?.scheduledTime || 'unknown';
    const sentKey = `${scheduleId}:${todayKey}:availability:${activeKey}`;
    await sendReservedMessage({
      userId,
      scheduleId,
      sentKey,
      botToken,
      chatId,
      message: formatAvailabilityMessage({
        title: String(alert.title || 'Train Alert'),
        origin: routeInfo.origin,
        destination: routeInfo.destination,
        departureTime,
        train: watch.active,
        fallbackPlatform: selectedPlatform,
      }),
    });
  }

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
        fallbackPlatform: selectedPlatform,
      }),
    });
  }

  const activeTrain = watch.active;

  for (const offset of fixedOffsets) {
    if (!isWithinWindow(minsUntilDeparture, offset)) continue;
    const trainKey = activeTrain?.tripId || activeTrain?.scheduledTime || 'unknown';
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
        train: activeTrain,
        fallbackPlatform: selectedPlatform,
      }),
    });
  }

  if (
    activeTrain &&
    !activeTrain.cancelled &&
    activeTrain.status === 'delayed' &&
    minsUntilDeparture >= -0.5 &&
    minsUntilDeparture <= maxWatchMinutes
  ) {
    const bucket = Math.floor(now.getTime() / (delayRecheckMinutes * 60 * 1000));
    const sentKey = `${scheduleId}:${todayKey}:delay-${bucket}:${activeTrain.tripId || activeTrain.scheduledTime}:${activeTrain.delayMinutes || 0}`;
    await sendReservedMessage({
      userId,
      scheduleId,
      sentKey,
      botToken,
      chatId,
      message: formatDelayMessage({
        title: String(alert.title || 'Train Alert'),
        origin: routeInfo.origin,
        destination: routeInfo.destination,
        train: activeTrain,
        fallbackPlatform: selectedPlatform,
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

        const selectedPlatform = String(alert.selectedPlatform || '');
        const watch = await resolveWatchedTrain({
          apiKey,
          ...routeInfo,
          departureDate,
          selectedTripId: String(alert.selectedTripId || ''),
          selectedPlatform,
          targetRoute: String(alert.targetRoute || ''),
          targetDestination: String(alert.targetDestination || routeInfo.destination),
          fallbackWindowMinutes,
        });

        await updateDeliveryState(userId, scheduleId, watch);

        if (minsUntilDeparture >= -0.5 && minsUntilDeparture <= maxWatchMinutes + 1) {
          const activeKey = watch.active?.tripId || watch.active?.scheduledTime || 'unknown';
          const sentKey = `${scheduleId}:${todayKey}:availability:${activeKey}`;
          await sendReservedMessage({
            userId,
            scheduleId,
            sentKey,
            botToken,
            chatId,
            message: formatAvailabilityMessage({
              title: String(alert.title || 'Train Alert'),
              origin: routeInfo.origin,
              destination: routeInfo.destination,
              departureTime,
              train: watch.active,
              fallbackPlatform: selectedPlatform,
            }),
          });
        }

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
              fallbackPlatform: selectedPlatform,
            }),
          });
        }

        const activeTrain = watch.active;

        for (const offset of fixedOffsets) {
          if (!isWithinWindow(minsUntilDeparture, offset)) continue;
          const trainKey = activeTrain?.tripId || activeTrain?.scheduledTime || 'unknown';
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
              train: activeTrain,
              fallbackPlatform: selectedPlatform,
            }),
          });
        }

        if (
          activeTrain &&
          !activeTrain.cancelled &&
          activeTrain.status === 'delayed' &&
          minsUntilDeparture >= -0.5 &&
          minsUntilDeparture <= maxWatchMinutes
        ) {
          const bucket = Math.floor(now.getTime() / (delayRecheckMinutes * 60 * 1000));
          const sentKey = `${scheduleId}:${todayKey}:delay-${bucket}:${activeTrain.tripId || activeTrain.scheduledTime}:${activeTrain.delayMinutes || 0}`;
          await sendReservedMessage({
            userId,
            scheduleId,
            sentKey,
            botToken,
            chatId,
            message: formatDelayMessage({
              title: String(alert.title || 'Train Alert'),
              origin: routeInfo.origin,
              destination: routeInfo.destination,
              train: activeTrain,
              fallbackPlatform: selectedPlatform,
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
