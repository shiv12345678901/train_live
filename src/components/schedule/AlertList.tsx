import { useMemo, useState } from 'react';
import type { AlertSchedule, RouteCard } from '@/types';
import { useAppStore } from '@/store/appStore';
import { testAlert } from '@/api/scheduleApi';

export type ScheduleFilter = 'active' | 'paused' | 'today' | 'one-time' | 'recurring' | 'completed';

interface AlertListProps {
  schedules: AlertSchedule[];
  routeCards: RouteCard[];
  filter: ScheduleFilter;
  expandedId?: string | null;
  onExpand: (id: string | null) => void;
  onEdit: (schedule: AlertSchedule) => void;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALERT_OFFSETS = [25, 20, 18, 16, 14, 12, 10, 5];

type SendState = 'idle' | 'sending' | 'sent' | 'error';
type ActivityItem = { title: string; body?: string };

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function localMinutes(time: string): number {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function formatClockFromMinutes(minutes: number): string {
  const safeMinutes = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

function formatTime(time: string): string {
  return formatClockFromMinutes(localMinutes(time));
}

function routeLabel(schedule: AlertSchedule, routeCards: RouteCard[]): string {
  const route = routeCards.find((card) => card.id === schedule.routeCardId);
  if (!route) return 'Saved route';
  return `${route.origin.replace(/\s*Station\s*/gi, '')} -> ${route.destination.replace(/\s*Station\s*/gi, '')}`;
}

function formatDays(schedule: AlertSchedule): string {
  const days = schedule.days || [];
  if (schedule.oneTimeDate) return schedule.oneTimeDate;
  if (days.length === 0) return 'No repeat days';
  if (days.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day))) return 'Weekdays';
  if (days.length === 7) return 'Daily';
  return days.map((day) => DAY_LABELS[day]).join(', ');
}

function isTodaySchedule(schedule: AlertSchedule): boolean {
  if (schedule.oneTimeDate) return schedule.oneTimeDate === todayKey();
  return (schedule.days || []).includes(new Date().getDay());
}

function isCompleted(schedule: AlertSchedule): boolean {
  if (!schedule.oneTimeDate) return false;
  if (schedule.oneTimeDate < todayKey()) return true;
  if (schedule.oneTimeDate > todayKey()) return false;
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  return localMinutes(schedule.departureTime) < nowMinutes - 1;
}

function nextAlert(schedule: AlertSchedule): string {
  if (!schedule.enabled) return 'Paused';
  if (isCompleted(schedule)) return 'Completed';
  if (!isTodaySchedule(schedule)) return 'Next active day';

  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const departureMinutes = localMinutes(schedule.departureTime);
  const nextOffset = ALERT_OFFSETS.find((offset) => departureMinutes - offset >= nowMinutes);
  if (!nextOffset) return 'Final checks active';
  return `${formatClockFromMinutes(departureMinutes - nextOffset)}, ${nextOffset} min before`;
}

function matchedTrain(schedule: AlertSchedule): string {
  const state = schedule.deliveryState?.lastKnownTripState;
  if (state?.estimatedTime || state?.platform || state?.route) {
    const pieces = [
      state.route,
      state.estimatedTime ? new Date(state.estimatedTime).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }) : null,
      state.platform ? `Platform ${state.platform}` : null,
      state.status,
    ].filter(Boolean);
    return pieces.join(' · ');
  }
  if (schedule.selectedTripId || schedule.selectedPlatform || schedule.targetRoute) {
    const pieces = [
      schedule.targetRoute || 'Selected train-card service',
      schedule.selectedPlatform ? `Platform ${schedule.selectedPlatform}` : null,
    ].filter(Boolean);
    return pieces.join(' · ');
  }
  return `Nearest train around ${formatTime(schedule.departureTime)}`;
}

function syncState(schedule: AlertSchedule): string {
  if (schedule.id.startsWith('local-')) return 'Pending upload';
  if (schedule.cloudflareIndexed === false) return 'Firestore saved';
  return 'Synced and indexed';
}

function sentActivity(schedule: AlertSchedule): ActivityItem[] {
  const activity = schedule.deliveryState?.activity || [];
  if (activity.length > 0) {
    return [...activity]
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
      .slice(-4)
      .reverse()
      .map((item) => ({
        title: `${item.source === 'test' ? 'Send now' : 'Scheduler'} sent ${new Date(item.sentAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}`,
        body: item.message,
      }));
  }

  const keys = schedule.deliveryState?.sentKeys || [];
  return keys.slice(-4).reverse().map((key) => {
    const type = key.split(':')[2] || 'sent';
    if (type.startsWith('fixed-')) return { title: `${type.replace('fixed-', '')} min reminder sent` };
    if (type.startsWith('delay-')) return { title: 'Delay message sent' };
    if (type.startsWith('recheck-')) return { title: 'Live train update sent' };
    if (type === 'cancelled') return { title: 'Cancellation message sent' };
    if (type === 'availability') return { title: 'Availability message sent' };
    return { title: 'Message sent' };
  });
}

function sendStatusText(status: SendState, isLocal: boolean): string {
  if (isLocal) return 'Save online before testing Telegram.';
  if (status === 'sending') return 'Sending test message...';
  if (status === 'sent') return 'Test message sent.';
  if (status === 'error') return 'Test failed. Check Telegram settings and Netlify logs.';
  return 'Ready to send a test message.';
}

function matchesFilter(schedule: AlertSchedule, filter: ScheduleFilter): boolean {
  if (filter === 'active') return schedule.enabled && !isCompleted(schedule);
  if (filter === 'paused') return !schedule.enabled;
  if (filter === 'today') return isTodaySchedule(schedule) && !isCompleted(schedule);
  if (filter === 'one-time') return Boolean(schedule.oneTimeDate) && !isCompleted(schedule);
  if (filter === 'recurring') return !schedule.oneTimeDate;
  return isCompleted(schedule);
}

export function AlertList({ schedules, routeCards, filter, expandedId, onExpand, onEdit }: AlertListProps) {
  const { toggleAlertSchedule, deleteAlertSchedule } = useAppStore();
  const [sendState, setSendState] = useState<Record<string, SendState>>({});

  const visibleSchedules = useMemo(
    () => schedules
      .filter((schedule) => matchesFilter(schedule, filter))
      .sort((a, b) => a.departureTime.localeCompare(b.departureTime)),
    [filter, schedules]
  );

  const handleDelete = (id: string) => {
    if (!window.confirm('Delete this alert schedule?')) return;
    deleteAlertSchedule(id);
  };

  const handleSendNow = async (id: string) => {
    if (id.startsWith('local-')) {
      setSendState((state) => ({ ...state, [id]: 'error' }));
      return;
    }

    setSendState((state) => ({ ...state, [id]: 'sending' }));
    try {
      await testAlert(id);
      setSendState((state) => ({ ...state, [id]: 'sent' }));
    } catch (error) {
      console.error('Send now failed', error);
      setSendState((state) => ({ ...state, [id]: 'error' }));
    }
  };

  if (visibleSchedules.length === 0) {
    return (
      <div className="alert-list-empty">
        <p>No alerts in this view.</p>
        <p className="alert-list-empty-hint">Create a new alert or switch filters.</p>
      </div>
    );
  }

  return (
    <div className="alert-list">
      {visibleSchedules.map((schedule) => {
        const isExpanded = expandedId === schedule.id;
        const status = sendState[schedule.id] || 'idle';
        const isLocal = schedule.id.startsWith('local-');
        const activity = sentActivity(schedule);

        return (
          <article key={schedule.id} className={`alert-list-item ${isExpanded ? 'is-expanded' : ''}`}>
            <button className="alert-list-item-main" type="button" onClick={() => onExpand(isExpanded ? null : schedule.id)}>
              <div className="alert-list-item-header">
                <span className="alert-list-item-title">{routeLabel(schedule, routeCards)}</span>
                <span className={`alert-list-status ${schedule.enabled ? 'is-active' : 'is-paused'}`}>
                  {isCompleted(schedule) ? 'Completed' : schedule.enabled ? 'Active' : 'Paused'}
                </span>
              </div>
              <div className="alert-list-card-grid">
                <span><b>Departure</b>{formatTime(schedule.departureTime)}</span>
                <span><b>Next alert</b>{nextAlert(schedule)}</span>
                <span><b>Matched train</b>{matchedTrain(schedule)}</span>
                <span><b>Sync</b>{syncState(schedule)}</span>
              </div>
            </button>

            <div className="alert-list-item-actions">
              <label className="alert-toggle" title={schedule.enabled ? 'Disable alert' : 'Enable alert'}>
                <input
                  type="checkbox"
                  checked={schedule.enabled}
                  onChange={() => toggleAlertSchedule(schedule.id, !schedule.enabled)}
                  disabled={isCompleted(schedule)}
                />
                <span className="alert-toggle-slider" />
              </label>
            </div>

            {isExpanded && (
              <div className="alert-list-detail">
                <div className="alert-timeline">
                  {ALERT_OFFSETS.map((offset) => (
                    <span key={offset} className="alert-timeline-step">{offset} min</span>
                  ))}
                </div>
                <div className="alert-list-detail-grid">
                  <div>
                    <span className="alert-detail-label">Schedule</span>
                    <strong>{formatDays(schedule)}</strong>
                  </div>
                  <div>
                    <span className="alert-detail-label">Delay checks</span>
                    <strong>Every {schedule.delayRecheckMinutes || 2} min</strong>
                  </div>
                  <div>
                    <span className="alert-detail-label">Fallback</span>
                    <strong>+/-{schedule.fallbackWindowMinutes || 5} min replacement</strong>
                  </div>
                  <div>
                    <span className="alert-detail-label">Saved</span>
                    <strong>{new Date(schedule.updatedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</strong>
                  </div>
                </div>
                <div className={`alert-list-activity alert-list-activity-${status}`}>
                  <span className="alert-detail-label">Activity</span>
                  <p>{sendStatusText(status, isLocal)}</p>
                  {activity.length > 0 && (
                    <ul className="alert-activity-list">
                      {activity.map((item, index) => (
                        <li key={`${item.title}-${index}`}>
                          <strong>{item.title}</strong>
                          {item.body && <span>{item.body}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="alert-list-detail-actions">
                  <button className="btn-secondary alert-detail-btn" type="button" onClick={() => onEdit(schedule)} disabled={isCompleted(schedule)}>Edit</button>
                  <button
                    className={`btn-primary alert-detail-btn ${status === 'sending' ? 'is-sending' : ''}`}
                    type="button"
                    onClick={() => handleSendNow(schedule.id)}
                    disabled={status === 'sending' || isLocal || isCompleted(schedule)}
                  >
                    {status === 'sending' ? 'Sending...' : status === 'sent' ? 'Sent' : status === 'error' ? 'Try again' : 'Send now'}
                  </button>
                  <button className="alert-list-item-delete-btn alert-detail-delete-btn" onClick={() => handleDelete(schedule.id)} title="Delete alert" type="button">Delete</button>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
