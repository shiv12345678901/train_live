import type { AlertSchedule } from '@/types';
import { useAppStore } from '@/store/appStore';
import { testAlert } from '@/api/scheduleApi';

interface AlertListProps {
  schedules: AlertSchedule[];
  telegramConfigured: boolean;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function AlertList({ schedules, telegramConfigured }: AlertListProps) {
  const { toggleAlertSchedule, deleteAlertSchedule } = useAppStore();

  const handleToggle = (id: string, currentEnabled: boolean) => {
    toggleAlertSchedule(id, !currentEnabled);
  };

  const handleDelete = (id: string) => {
    deleteAlertSchedule(id);
  };

  const handleTestAlert = async (id: string) => {
    try {
      await testAlert(id);
    } catch (e) {
      console.error('Test alert failed', e);
    }
  };

  if (schedules.length === 0) {
    return (
      <div className="alert-list-empty">
        <p>No alerts scheduled yet.</p>
        <p className="alert-list-empty-hint">Tap "New Alert" to create one, or use the bell icon on a train departure.</p>
      </div>
    );
  }

  return (
    <div className="alert-list">
      {schedules.map((schedule) => (
        <div key={schedule.id} className="alert-list-item">
          <div className="alert-list-item-main">
            <div className="alert-list-item-header">
              <span className="alert-list-item-title">{schedule.title}</span>
              <span className="alert-list-item-time">{schedule.departureTime}</span>
            </div>
            <div className="alert-list-item-days">
              {schedule.oneTimeDate
                ? <span className="alert-list-item-date">{schedule.oneTimeDate}</span>
                : schedule.days.map((d) => DAY_LABELS[d]).join(', ')
              }
            </div>
            {schedule.selectedPlatform && (
              <div className="alert-list-item-platform">Platform {schedule.selectedPlatform}</div>
            )}
          </div>
          <div className="alert-list-item-actions">
            <label className="alert-toggle">
              <input
                type="checkbox"
                checked={schedule.enabled}
                onChange={() => handleToggle(schedule.id, schedule.enabled)}
              />
              <span className="alert-toggle-slider" />
            </label>
            {telegramConfigured && (
              <button
                className="alert-list-item-test-btn"
                onClick={() => handleTestAlert(schedule.id)}
                title="Send test alert"
              >
                🔔
              </button>
            )}
            <button
              className="alert-list-item-delete-btn"
              onClick={() => handleDelete(schedule.id)}
              title="Delete alert"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
