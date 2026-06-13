import { useState } from 'react';
import type { AlertSchedule, RouteCard } from '@/types';
import { useAppStore } from '@/store/appStore';
import { testAlert } from '@/api/scheduleApi';

interface AlertListProps {
  schedules: AlertSchedule[];
  routeCards: RouteCard[];
  expandedId?: string | null;
  onExpand: (id: string | null) => void;
  onEdit: (schedule: AlertSchedule) => void;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type SendState = 'idle' | 'sending' | 'sent' | 'error';

function formatDays(schedule: AlertSchedule): string {
  if (schedule.oneTimeDate) return schedule.oneTimeDate;
  if (schedule.days.length === 0) return 'No repeat days';
  if (schedule.days.length === 5 && [1, 2, 3, 4, 5].every((day) => schedule.days.includes(day))) return 'Weekdays';
  if (schedule.days.length === 7) return 'Daily';
  return schedule.days.map((day) => DAY_LABELS[day]).join(', ');
}

function routeLabel(schedule: AlertSchedule, routeCards: RouteCard[]): string {
  const route = routeCards.find((card) => card.id === schedule.routeCardId);
  if (!route) return 'Saved route';
  return `${route.origin.replace(/\s*Station\s*/gi, '')} -> ${route.destination.replace(/\s*Station\s*/gi, '')}`;
}

function sendStatusText(status: SendState, isLocal: boolean): string {
  if (isLocal) return 'Save online before testing Telegram.';
  if (status === 'sending') return 'Sending test message...';
  if (status === 'sent') return 'Test message sent.';
  if (status === 'error') return 'Test failed. Check Telegram settings and Netlify logs.';
  return 'Send a test Telegram message now without waiting for the schedule.';
}

export function AlertList({ schedules, routeCards, expandedId, onExpand, onEdit }: AlertListProps) {
  const { toggleAlertSchedule, deleteAlertSchedule } = useAppStore();
  const [sendState, setSendState] = useState<Record<string, SendState>>({});

  const handleToggle = (id: string, currentEnabled: boolean) => {
    toggleAlertSchedule(id, !currentEnabled);
  };

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
      window.setTimeout(() => {
        setSendState((state) => ({ ...state, [id]: 'idle' }));
      }, 2500);
    } catch (error) {
      console.error('Send now failed', error);
      setSendState((state) => ({ ...state, [id]: 'error' }));
    }
  };

  if (schedules.length === 0) {
    return (
      <div className="alert-list-empty">
        <p>No alerts scheduled yet.</p>
        <p className="alert-list-empty-hint">Tap "New Alert" or use the bell on a train card to watch a service.</p>
      </div>
    );
  }

  return (
    <div className="alert-list">
      {[...schedules].sort((a, b) => a.departureTime.localeCompare(b.departureTime)).map((schedule) => {
        const isExpanded = expandedId === schedule.id;
        const status = sendState[schedule.id] || 'idle';
        const isLocal = schedule.id.startsWith('local-');
        const meta = [schedule.targetRoute, schedule.selectedPlatform ? `Platform ${schedule.selectedPlatform}` : ''].filter(Boolean).join(' • ');

        return (
          <article key={schedule.id} className={`alert-list-item ${isExpanded ? 'is-expanded' : ''}`}>
            <button className="alert-list-item-main" type="button" onClick={() => onExpand(isExpanded ? null : schedule.id)}>
              <div className="alert-list-item-header">
                <span className="alert-list-item-title">{schedule.title}</span>
                <span className="alert-list-item-time">{schedule.departureTime}</span>
              </div>
              <div className="alert-list-item-days">{formatDays(schedule)}</div>
              <div className="alert-list-item-route">{routeLabel(schedule, routeCards)}</div>
              {meta && <div className="alert-list-item-platform">{meta}</div>}
            </button>

            <div className="alert-list-item-actions">
              <label className="alert-toggle" title={schedule.enabled ? 'Disable alert' : 'Enable alert'}>
                <input
                  type="checkbox"
                  checked={schedule.enabled}
                  onChange={() => handleToggle(schedule.id, schedule.enabled)}
                />
                <span className="alert-toggle-slider" />
              </label>
            </div>

            {isExpanded && (
              <div className="alert-list-detail">
                <div className="alert-list-detail-grid">
                  <div>
                    <span className="alert-detail-label">Reminders</span>
                    <strong>{schedule.fixedReminderMinutes.join(', ')} min before</strong>
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
                    <span className="alert-detail-label">Status</span>
                    <strong>{schedule.enabled ? 'Active' : 'Paused'}</strong>
                  </div>
                </div>
                <div className={`alert-list-activity alert-list-activity-${status}`}>
                  <span className="alert-detail-label">Test</span>
                  <p>{sendStatusText(status, isLocal)}</p>
                </div>
                <div className="alert-list-detail-actions">
                  <button className="btn-secondary alert-detail-btn" type="button" onClick={() => onEdit(schedule)}>Edit</button>
                  <button
                    className={`btn-primary alert-detail-btn ${status === 'sending' ? 'is-sending' : ''}`}
                    type="button"
                    onClick={() => handleSendNow(schedule.id)}
                    disabled={status === 'sending' || isLocal}
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
