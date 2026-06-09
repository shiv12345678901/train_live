import type { TrainDeparture } from '@/types';
import { getTransportMode } from './transportMode';

interface TrainCardProps {
  train: TrainDeparture;
  onBellTap?: () => void;
  onTap?: () => void;
}

function formatPlatform(raw: string): string {
  const match = raw.match(/(\d+)$/);
  if (match) return match[1];
  return raw || '—';
}

function formatTime(isoTime: string): string {
  const date = new Date(isoTime);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

function getMinutesUntil(isoTime: string): number {
  return Math.round((new Date(isoTime).getTime() - Date.now()) / 60000);
}

function TransportIcon({ mode }: { mode: string }) {
  switch (mode) {
    case 'metro':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 4h12a2 2 0 012 2v10a4 4 0 01-4 4H8a4 4 0 01-4-4V6a2 2 0 012-2z" />
          <path d="M9 22l1-2h4l1 2" />
          <circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="15" cy="14" r="1.5" fill="currentColor" stroke="none" />
          <path d="M8 4l4 5 4-5" />
        </svg>
      );
    case 'bus':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="3" width="16" height="16" rx="3" />
          <path d="M4 10h16" />
          <path d="M8 21v-2" />
          <path d="M16 21v-2" />
          <circle cx="7.5" cy="15" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="16.5" cy="15" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'light_rail':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="6" y="4" width="12" height="14" rx="3" />
          <path d="M9 22l1.5-4h3L15 22" />
          <circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="15" cy="14" r="1.5" fill="currentColor" stroke="none" />
          <path d="M6 9h12" />
        </svg>
      );
    case 'ferry':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 20c2-1 4-1 6 0s4 1 6 0 4-1 6 0" />
          <path d="M4 16l2-8h12l2 8" />
          <path d="M12 4v4" />
          <path d="M10 4h4" />
        </svg>
      );
    default: // train
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="10" width="16" height="8" rx="2" />
          <path d="M4 7a4 4 0 014-4h8a4 4 0 014 4v3H4V7z" />
          <circle cx="8" cy="15" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="16" cy="15" r="1.5" fill="currentColor" stroke="none" />
          <path d="M9 21l1.5-3h3L15 21" />
        </svg>
      );
  }
}

export function TrainCard({ train, onBellTap, onTap }: TrainCardProps) {
  const displayTime = train.estimatedTime || train.scheduledTime;
  const timeStr = displayTime ? formatTime(displayTime) : null;
  const scheduledStr = formatTime(train.scheduledTime);
  const minutesAway = displayTime ? getMinutesUntil(displayTime) : null;
  const platform = formatPlatform(train.platform);
  const mode = train.transportType || getTransportMode(train.route);

  const statusConfig = {
    'on-time': { label: 'On time', class: 'status-ontime', dot: '#0b7a3b' },
    'delayed': { label: `${train.delayMinutes || ''}min late`, class: 'status-delayed', dot: '#a16207' },
    'cancelled': { label: 'Cancelled', class: 'status-cancelled', dot: '#c1121f' },
    'changed': { label: 'Changed', class: 'status-changed', dot: '#545454' },
    'unknown': { label: 'Unknown', class: 'status-unknown', dot: '#545454' },
  }[train.status];
  const handleBellClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onBellTap?.();
  };

  return (
    <div className={`train-card ${train.cancelled ? 'train-card--cancelled' : ''}`} onClick={onTap} role={onTap ? 'button' : undefined}>
      <div className="train-card-top">
        <div className="train-card-left">
          <div className="train-card-platform-block">
            <span className="train-card-platform-label">Platform</span>
            <span className="train-card-platform-number">{platform}</span>
          </div>
          <div className="train-card-meta">
            <span className="train-card-route-line">
              <TransportIcon mode={mode} />
              {train.route}
            </span>
            <span className={`train-card-status-inline`}>
              <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill={statusConfig.dot} /></svg>
              {statusConfig.label}
            </span>
          </div>
        </div>

        <div className="train-card-right">
          <div className="train-card-time-group">
            {timeStr ? (
              <>
                <span className="train-card-time">{timeStr}</span>
                {minutesAway !== null && minutesAway > 0 && minutesAway < 90 && (
                  <span className="train-card-countdown">in {minutesAway} min</span>
                )}
                {train.estimatedTime && train.estimatedTime !== train.scheduledTime && (
                  <span className="train-card-scheduled">Sched {scheduledStr}</span>
                )}
              </>
            ) : (
              <span className="train-card-time-unavailable">No time</span>
            )}
          </div>
          {!train.cancelled && onBellTap && (
            <button className="train-card-bell-icon" onClick={handleBellClick} type="button" aria-label="Set alert">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Filter Chips Component ──────────────────────────────────────────

interface ModeFilterProps {
  trains: TrainDeparture[];
  activeFilter: string;
  onFilter: (mode: string) => void;
}

const MODE_CHIPS: { mode: string; label: string }[] = [
  { mode: 'train', label: 'Train' },
  { mode: 'metro', label: 'Metro' },
  { mode: 'bus', label: 'Bus' },
  { mode: 'light_rail', label: 'Light Rail' },
  { mode: 'ferry', label: 'Ferry' },
];

export function ModeFilter({ trains, activeFilter, onFilter }: ModeFilterProps) {
  // Determine which modes are present in the results
  const presentModes = new Set(trains.map(t => t.transportType || getTransportMode(t.route)));

  // Only show chips that have matching trains
  const visibleChips = MODE_CHIPS.filter(c => presentModes.has(c.mode));

  // If only one mode present, no need for filter
  if (visibleChips.length <= 1) return null;

  return (
    <div className="mode-filter">
      <button
        className={`mode-filter-chip ${activeFilter === 'all' ? 'active' : ''}`}
        onClick={() => onFilter('all')}
        type="button"
      >
        All
      </button>
      {visibleChips.map(chip => (
        <button
          key={chip.mode}
          className={`mode-filter-chip ${activeFilter === chip.mode ? 'active' : ''}`}
          onClick={() => onFilter(chip.mode)}
          type="button"
        >
          <TransportIcon mode={chip.mode} />
          {chip.label}
        </button>
      ))}
    </div>
  );
}
