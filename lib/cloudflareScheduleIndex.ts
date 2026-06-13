type ScheduleIndexRecord = {
  userId: string;
  scheduleId: string;
  routeCardId: string;
  title: string;
  departureTime: string;
  days: number[];
  oneTimeDate: string | null;
  enabled: boolean;
  fixedReminderMinutes: number[];
  delayRecheckMinutes: number;
  timezone: string;
  updatedAt: string;
};

type ScheduleSource = Record<string, unknown>;

const KV_KEY_PREFIX = 'schedule';

function cloudflareConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !namespaceId || !apiToken) return null;
  return { accountId, namespaceId, apiToken };
}

function scheduleIndexKey(userId: string, scheduleId: string): string {
  return `${KV_KEY_PREFIX}:${userId}:${scheduleId}`;
}

function asNumberArray(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback;
  const numbers = value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
  return numbers.length === value.length ? numbers : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function buildScheduleIndexRecord(
  userId: string,
  scheduleId: string,
  schedule: ScheduleSource
): ScheduleIndexRecord {
  return {
    userId,
    scheduleId,
    routeCardId: asString(schedule.routeCardId),
    title: asString(schedule.title, 'Train Alert'),
    departureTime: asString(schedule.departureTime),
    days: asNumberArray(schedule.days, []),
    oneTimeDate: asString(schedule.oneTimeDate) || null,
    enabled: typeof schedule.enabled === 'boolean' ? schedule.enabled : true,
    fixedReminderMinutes: asNumberArray(schedule.fixedReminderMinutes, [25, 20, 10, 5]),
    delayRecheckMinutes: typeof schedule.delayRecheckMinutes === 'number' ? schedule.delayRecheckMinutes : 2,
    timezone: asString(schedule.timezone, 'Australia/Sydney'),
    updatedAt: asString(schedule.updatedAt, new Date().toISOString()),
  };
}

export async function upsertCloudflareScheduleIndex(
  userId: string,
  scheduleId: string,
  schedule: ScheduleSource
): Promise<void> {
  const config = cloudflareConfig();
  if (!config) return;

  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}/values/${encodeURIComponent(scheduleIndexKey(userId, scheduleId))}`;
  const record = buildScheduleIndexRecord(userId, scheduleId, schedule);
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(record),
  });

  if (!response.ok) {
    throw new Error(`Cloudflare KV sync failed (${response.status})`);
  }
}

export async function deleteCloudflareScheduleIndex(userId: string, scheduleId: string): Promise<void> {
  const config = cloudflareConfig();
  if (!config) return;

  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}/values/${encodeURIComponent(scheduleIndexKey(userId, scheduleId))}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Cloudflare KV delete failed (${response.status})`);
  }
}
