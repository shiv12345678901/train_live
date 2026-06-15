import type { TrainDeparture, OccupancyLevel } from '@/types';
import { getDepartureMode } from './transportMode';
import { useCountdown, formatCountdown } from '@/hooks/useCountdown';
import { formatTransportTime } from '@/utils/timeUtils';

interface TrainCardProps {
  train: TrainDeparture;
  onBellTap?: () => void;
  onTap?: () => void;
  isScheduled?: boolean;
}

function formatTime(isoTime: string): string {
  return formatTransportTime(isoTime, 'No time');
}

// ─── Occupancy Icon Component ────────────────────────────────────────

function OccupancyIndicator({ level }: { level: OccupancyLevel }) {
  if (level === 'unknown') return null;

  const config: Record<OccupancyLevel, { label: string; filled: number; color: string }> = {
    empty: { label: 'Many seats', filled: 0, color: 'var(--success)' },
    low: { label: 'Seats available', filled: 1, color: 'var(--success)' },
    medium: { label: 'Few seats', filled: 2, color: 'var(--warning)' },
    high: { label: 'Standing room', filled: 3, color: '#c2410c' },
    full: { label: 'At capacity', filled: 4, color: 'var(--danger)' },
    unknown: { label: '', filled: 0, color: '' },
  };

  const { label, filled, color } = config[level];

  return (
    <div className="train-card-occupancy" title={label}>
      <div className="train-card-occupancy-seats">
        {[0, 1, 2, 3].map((i) => (
          <svg key={i} width="10" height="12" viewBox="0 0 10 12" fill="none">
            <path
              d="M2 1h6a1 1 0 011 1v6a2 2 0 01-2 2H3a2 2 0 01-2-2V2a1 1 0 011-1z"
              fill={i < filled ? color : 'var(--border)'}
              stroke={i < filled ? color : 'var(--border)'}
              strokeWidth="0.5"
            />
            <path d="M2 10v1.5M8 10v1.5" stroke={i < filled ? color : 'var(--border)'} strokeWidth="1" strokeLinecap="round" />
          </svg>
        ))}
      </div>
      <span className="train-card-occupancy-label" style={{ color }}>{label}</span>
    </div>
  );
}

// ─── Trip Duration Display ────────────────────────────────────────────

function TripDuration({ train }: { train: TrainDeparture }) {
  if (!train.scheduledTime) return null;
  // Estimate duration from first stop to last (using fare estimate timing data isn't available,
  // so we'll show it if legs data exists)
  if (train.legs && train.legs.length > 0) {
    const totalMin = train.legs.reduce((sum, l) => sum + l.durationMinutes, 0);
    if (totalMin > 0) return <span className="train-card-duration">{totalMin} min trip</span>;
  }
  return null;
}

// ─── Multi-leg Journey Display ───────────────────────────────────────

function MultiLegSummary({ legs }: { legs: TrainDeparture['legs'] }) {
  if (!legs || legs.length <= 1) return null;
  const transitLegs = legs.filter(l => !l.isWalking);
  const totalDuration = legs.reduce((sum, l) => sum + l.durationMinutes, 0);

  return (
    <div className="train-card-multileg">
      <div className="train-card-multileg-icons">
        {transitLegs.map((leg, i) => (
          <span key={i} className="train-card-multileg-step">
            <TransportIcon mode={leg.mode} />
            <span className="train-card-multileg-route">{leg.route}</span>
            {i < transitLegs.length - 1 && <span className="train-card-multileg-arrow">›</span>}
          </span>
        ))}
      </div>
      <span className="train-card-multileg-duration">{totalDuration} min total</span>
    </div>
  );
}

// ─── Service Alerts Chip ─────────────────────────────────────────────

function AlertChips({ alerts }: { alerts: TrainDeparture['alerts'] }) {
  if (!alerts || alerts.length === 0) return null;
  const hasCritical = alerts.some(a => a.severity === 'critical');
  const hasWarning = alerts.some(a => a.severity === 'warning');
  
  return (
    <div className="train-card-alerts">
      <span className={`train-card-alert-chip ${hasCritical ? 'critical' : hasWarning ? 'warning' : 'info'}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.29 3.86l-8.6 14.86A2 2 0 003.4 22h17.2a2 2 0 001.71-3.28l-8.6-14.86a2 2 0 00-3.42 0z" />
        </svg>
        {alerts.length} alert{alerts.length > 1 ? 's' : ''}
      </span>
    </div>
  );
}

// ─── Live Countdown ──────────────────────────────────────────────────

function LiveCountdown({ isoTime }: { isoTime: string }) {
  const minutes = useCountdown(isoTime);
  const label = formatCountdown(minutes);
  if (!label || minutes === null || minutes > 90) return null;
  
  const urgency = minutes <= 1 ? 'urgent' : minutes <= 3 ? 'soon' : 'normal';
  
  return (
    <span className={`train-card-live-countdown train-card-live-countdown--${urgency}`}>
      {label}
    </span>
  );
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

export function TrainCard({ train, onBellTap, onTap, isScheduled = false }: TrainCardProps) {
  const displayTime = train.estimatedTime || train.scheduledTime;
  const timeStr = displayTime ? formatTime(displayTime) : null;
  const scheduledStr = formatTime(train.scheduledTime);
  const platform = train.platform || '';
  const mode = getDepartureMode(train);
  const hasMultiLeg = train.legs && train.legs.length > 1;

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
          {platform ? (
            <div className="train-card-platform-block">
              <span className="train-card-platform-label">
                {mode === 'bus' ? 'Stand' : mode === 'ferry' ? 'Wharf' : 'Plt'}
              </span>
              <span className="train-card-platform-number">{platform}</span>
            </div>
          ) : (
            <div className="train-card-mode-icon">
              <TransportIcon mode={mode} />
            </div>
          )}
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
                {displayTime && <LiveCountdown isoTime={displayTime} />}
                {train.estimatedTime && train.estimatedTime !== train.scheduledTime && (
                  <span className="train-card-scheduled">Sched {scheduledStr}</span>
                )}
              </>
            ) : (
              <span className="train-card-time-unavailable">No time</span>
            )}
          </div>
          {!train.cancelled && onBellTap && (
            <button className={`train-card-bell-icon ${isScheduled ? 'is-scheduled' : ''}`} onClick={handleBellClick} type="button" aria-label={isScheduled ? 'Scheduled alert' : 'Set alert'} title={isScheduled ? 'Scheduled' : 'Set alert'}>
              {isScheduled ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  <path d="M20 4L9 15l-5-5" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Bottom row: occupancy, fare, alerts, multi-leg */}
      <div className="train-card-bottom-row">
        {train.occupancy && train.occupancy !== 'unknown' && (
          <OccupancyIndicator level={train.occupancy} />
        )}
        {train.fareEstimate && (
          <TripDuration train={train} />
        )}
        <AlertChips alerts={train.alerts} />
      </div>
      
      {hasMultiLeg && <MultiLegSummary legs={train.legs} />}
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
  const presentModes = new Set(trains.map(getDepartureMode));

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
