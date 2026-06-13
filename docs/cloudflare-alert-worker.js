const NSW_TIME_ZONE = 'Australia/Sydney';
const SCHEDULE_PREFIX = 'schedule:';
const DISPATCH_PREFIX = 'dispatch:';

function sydneyParts(date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: NSW_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
      hourCycle: 'h23',
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
}

function dateKey(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function weekday(parts) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
}

function minuteOfDay(time) {
  const [hour, minute] = String(time || '').split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function appliesToday(schedule, parts) {
  const today = dateKey(parts);
  if (schedule.oneTimeDate) return schedule.oneTimeDate === today;
  return Array.isArray(schedule.days) && schedule.days.includes(weekday(parts));
}

function dueEvents(schedule, now) {
  if (!schedule.enabled || !appliesToday(schedule, now.parts)) return [];

  const departureMinute = minuteOfDay(schedule.departureTime);
  if (departureMinute === null) return [];

  const currentMinute = Number(now.parts.hour) * 60 + Number(now.parts.minute);
  const minutesUntilDeparture = departureMinute - currentMinute;
  if (minutesUntilDeparture < -1 || minutesUntilDeparture > 26) return [];

  const events = [];
  const fixedOffsets = Array.isArray(schedule.fixedReminderMinutes) && schedule.fixedReminderMinutes.length > 0
    ? schedule.fixedReminderMinutes
    : [25, 20, 10, 5];

  for (const offset of fixedOffsets) {
    if (Math.abs(minutesUntilDeparture - offset) <= 0) {
      events.push(`fixed-${offset}`);
    }
  }

  const recheckEvery = Number(schedule.delayRecheckMinutes || 2);
  if (minutesUntilDeparture < 20 && minutesUntilDeparture > 10 && recheckEvery > 0 && minutesUntilDeparture % recheckEvery === 0) {
    events.push(`recheck-${minutesUntilDeparture}`);
  }

  return events;
}

async function alreadyDispatched(env, schedule, eventName, today) {
  const key = `${DISPATCH_PREFIX}${schedule.userId}:${schedule.scheduleId}:${today}:${eventName}`;
  const existing = await env.SCHEDULES.get(key);
  if (existing) return true;
  await env.SCHEDULES.put(key, '1', { expirationTtl: 2 * 24 * 60 * 60 });
  return false;
}

async function dispatchSchedule(env, schedule, eventName) {
  const url = new URL('/.netlify/functions/alert-scheduler-run', env.NETLIFY_SITE_URL);
  url.searchParams.set('userId', schedule.userId);
  url.searchParams.set('scheduleId', schedule.scheduleId);
  url.searchParams.set('event', eventName);

  return fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-scheduler-secret': env.SCHEDULER_SECRET,
    },
  });
}

async function runDueChecks(env) {
  const nowDate = new Date();
  const parts = sydneyParts(nowDate);
  const today = dateKey(parts);
  const now = { date: nowDate, parts };
  let cursor;
  let dispatched = 0;

  do {
    const page = await env.SCHEDULES.list({ prefix: SCHEDULE_PREFIX, cursor });
    cursor = page.cursor;

    for (const key of page.keys) {
      const schedule = await env.SCHEDULES.get(key.name, 'json');
      if (!schedule) continue;

      for (const eventName of dueEvents(schedule, now)) {
        if (await alreadyDispatched(env, schedule, eventName, today)) continue;
        await dispatchSchedule(env, schedule, eventName);
        dispatched += 1;
      }
    }
  } while (cursor);

  return dispatched;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDueChecks(env));
  },

  async fetch(request, env) {
    const dispatched = await runDueChecks(env);
    return Response.json({ ok: true, dispatched });
  },
};
