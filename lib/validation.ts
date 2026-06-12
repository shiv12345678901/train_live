type JsonObject = Record<string, unknown>;

export function parseJsonObject(body: string | null): JsonObject {
  try {
    const parsed = JSON.parse(body || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Request body must be an object');
    }
    return parsed as JsonObject;
  } catch (error) {
    if (error instanceof Error && error.message === 'Request body must be an object') throw error;
    throw new Error('Invalid JSON body', { cause: error });
  }
}

function getString(input: JsonObject, key: string): string | undefined {
  const value = input[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function getStringArray(input: JsonObject, key: string): string[] {
  const value = input[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function getNullableString(input: JsonObject, key: string): string | null | undefined {
  if (!(key in input)) return undefined;
  return getString(input, key) || null;
}

function getRouteMode(input: JsonObject): string {
  const mode = getString(input, 'mode') || 'train';
  return ['all', 'train', 'metro', 'bus', 'light_rail', 'ferry'].includes(mode) ? mode : 'train';
}

function getNumberArray(input: JsonObject, key: string): number[] | undefined {
  const value = input[key];
  if (!Array.isArray(value)) return undefined;
  const numbers = value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
  return numbers.length === value.length ? numbers : undefined;
}

function getNumber(input: JsonObject, key: string): number | undefined {
  const value = input[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

export function routeCreateData(body: JsonObject) {
  const title = getString(body, 'title');
  const origin = getString(body, 'origin');
  const destination = getString(body, 'destination');
  if (!title || !origin || !destination) {
    throw new Error('title, origin, and destination are required');
  }
  if (origin.toLowerCase() === destination.toLowerCase()) {
    throw new Error('origin and destination must be different');
  }

  return {
    title,
    origin,
    originStopId: getString(body, 'originStopId') || null,
    destination,
    destinationStopId: getString(body, 'destinationStopId') || null,
    mode: getRouteMode(body),
    routeFilter: getStringArray(body, 'routeFilter'),
    pinned: typeof body.pinned === 'boolean' ? body.pinned : false,
    pinnedAt: getNullableString(body, 'pinnedAt') ?? null,
  };
}

export function routeUpdates(body: JsonObject): JsonObject {
  const updates: JsonObject = {};
  const title = getString(body, 'title');
  const origin = getString(body, 'origin');
  const destination = getString(body, 'destination');
  const originStopId = getString(body, 'originStopId');
  const destinationStopId = getString(body, 'destinationStopId');

  if (title) updates.title = title;
  if (origin) updates.origin = origin;
  if (destination) updates.destination = destination;
  if ('originStopId' in body) updates.originStopId = originStopId || null;
  if ('destinationStopId' in body) updates.destinationStopId = destinationStopId || null;
  if ('mode' in body) updates.mode = getRouteMode(body);
  if (Array.isArray(body.routeFilter)) updates.routeFilter = getStringArray(body, 'routeFilter');
  if (typeof body.enabled === 'boolean') updates.enabled = body.enabled;
  if (typeof body.pinned === 'boolean') updates.pinned = body.pinned;
  if ('pinnedAt' in body) updates.pinnedAt = getNullableString(body, 'pinnedAt');

  if (typeof updates.origin === 'string' && typeof updates.destination === 'string' &&
    updates.origin.toLowerCase() === updates.destination.toLowerCase()) {
    throw new Error('origin and destination must be different');
  }

  return updates;
}

export function scheduleCreateData(body: JsonObject) {
  const routeCardId = getString(body, 'routeCardId');
  const title = getString(body, 'title');
  const departureTime = getString(body, 'departureTime');
  if (!routeCardId || !title || !departureTime) {
    throw new Error('routeCardId, title, and departureTime are required');
  }
  if (!isTime(departureTime)) throw new Error('departureTime must be HH:mm');

  return {
    routeCardId,
    title,
    departureTime,
    days: getNumberArray(body, 'days') || [],
    oneTimeDate: getString(body, 'oneTimeDate') || null,
    enabled: typeof body.enabled === 'boolean' ? body.enabled : true,
    fixedReminderMinutes: getNumberArray(body, 'fixedReminderMinutes') || [25, 20, 10, 5],
    changeCheckMinutes: getNumberArray(body, 'changeCheckMinutes') || [],
    selectedTripId: getString(body, 'selectedTripId') || null,
    selectedPlatform: getString(body, 'selectedPlatform') || null,
    targetRoute: getString(body, 'targetRoute') || null,
    targetDestination: getString(body, 'targetDestination') || null,
    timezone: getString(body, 'timezone') || 'Australia/Sydney',
    delayRecheckMinutes: getNumber(body, 'delayRecheckMinutes') ?? 2,
    fallbackWindowMinutes: getNumber(body, 'fallbackWindowMinutes') ?? 5,
    notifyOnCancellationImmediately: typeof body.notifyOnCancellationImmediately === 'boolean' ? body.notifyOnCancellationImmediately : true,
  };
}

export function scheduleUpdates(body: JsonObject): JsonObject {
  const updates: JsonObject = {};
  const textFields = ['routeCardId', 'title', 'departureTime', 'oneTimeDate', 'selectedTripId', 'selectedPlatform', 'targetRoute', 'targetDestination', 'timezone'];
  for (const field of textFields) {
    if (field in body) updates[field] = getString(body, field) || null;
  }
  if (typeof updates.departureTime === 'string' && !isTime(updates.departureTime)) {
    throw new Error('departureTime must be HH:mm');
  }
  if ('days' in body) updates.days = getNumberArray(body, 'days') || [];
  if ('fixedReminderMinutes' in body) updates.fixedReminderMinutes = getNumberArray(body, 'fixedReminderMinutes') || [25, 20, 10, 5];
  if ('changeCheckMinutes' in body) updates.changeCheckMinutes = getNumberArray(body, 'changeCheckMinutes') || [];
  if ('delayRecheckMinutes' in body) updates.delayRecheckMinutes = getNumber(body, 'delayRecheckMinutes') ?? 2;
  if ('fallbackWindowMinutes' in body) updates.fallbackWindowMinutes = getNumber(body, 'fallbackWindowMinutes') ?? 5;
  if (typeof body.notifyOnCancellationImmediately === 'boolean') updates.notifyOnCancellationImmediately = body.notifyOnCancellationImmediately;
  if (typeof body.enabled === 'boolean') updates.enabled = body.enabled;
  return updates;
}

export function settingsUpdates(body: JsonObject): JsonObject {
  const updates: JsonObject = {};
  for (const key of ['telegramBotToken', 'telegramChatId', 'apiKey', 'timezone', 'theme']) {
    if (key in body) updates[key] = getString(body, key) || null;
  }
  if (typeof body.telegramConnected === 'boolean') updates.telegramConnected = body.telegramConnected;
  return updates;
}
