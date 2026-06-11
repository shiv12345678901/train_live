import { useState, useRef, useCallback } from 'react';
import type { RouteCard as RouteCardType, TrainDeparture, TransportMode } from '@/types';

interface RouteCardProps {
  card: RouteCardType;
  alertStatus: string;
  nextTrain?: TrainDeparture;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  index?: number;
}

function formatTime(isoTime: string): string {
  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) return 'Live time unavailable';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

function getMinutesUntil(isoTime: string): string {
  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.max(0, Math.round((date.getTime() - Date.now()) / 60000));
  return `${minutes} min`;
}

function getNextService(train?: TrainDeparture): { time: string; detail: string; tone: 'normal' | 'late' | 'cancelled' | 'notice' } {
  if (!train) return { time: 'Live', detail: 'Tap for times', tone: 'notice' };
  const displayTime = train.estimatedTime || train.scheduledTime;
  const time = formatTime(displayTime);
  if (train.cancelled) return { time, detail: 'Cancelled', tone: 'cancelled' };
  if (train.status === 'delayed') return { time, detail: `${train.delayMinutes || '?'} min late`, tone: 'late' };
  if (train.status === 'unknown') return { time, detail: 'No live update', tone: 'notice' };
  return { time, detail: getMinutesUntil(displayTime), tone: 'normal' };
}

function RouteModeIcon({ mode }: { mode: TransportMode }) {
  if (mode === 'bus') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="4" width="14" height="15" rx="2" />
        <path d="M7 9h10" />
        <path d="M8 19v2" />
        <path d="M16 19v2" />
        <circle cx="8.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (mode === 'light_rail') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 5h12l1 8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4l1-8Z" />
        <path d="M8 9h8" />
        <path d="M9 21l2-4" />
        <path d="M15 21l-2-4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="10" width="16" height="8" rx="2"/>
      <path d="M4 7a4 4 0 014-4h8a4 4 0 014 4v3H4V7z"/>
      <circle cx="8" cy="15" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="16" cy="15" r="1.5" fill="currentColor" stroke="none"/>
      <path d="M9 21l1.5-3h3L15 21"/>
    </svg>
  );
}

function shortenStopName(name: string): string {
  return name
    .replace(/\s*(Station|Wharf|Light Rail|,\s*.*$)/gi, '')
    .replace(/\s+at\s+.*$/i, '')
    .replace(/\s+via\s+.*$/i, '')
    .trim();
}

export function RouteCard({ card, alertStatus, nextTrain, onClick, onEdit, onDelete, index = 0 }: RouteCardProps) {
  const shortOrigin = shortenStopName(card.origin);
  const shortDest = shortenStopName(card.destination);
  const isActive = alertStatus === 'Alert set';
  const nextService = getNextService(nextTrain);
  const mode = card.mode ?? 'train';

  const [showMenu, setShowMenu] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const handlePointerDown = useCallback(() => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setShowMenu(true);
    }, 600);
  }, []);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleClick = () => {
    if (didLongPress.current) {
      didLongPress.current = false;
      return;
    }
    if (showMenu) {
      setShowMenu(false);
      return;
    }
    onClick();
  };

  return (
    <div className="route-card-wrapper" style={{ animationDelay: `${index * 80}ms` }}>
      <button
        className={`route-card route-card--${nextService.tone}`}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={clearLongPress}
        onPointerLeave={clearLongPress}
        type="button"
      >
        <div className="route-card-main">
          <div className="route-card-header">
            <div className="route-card-icon">
              <RouteModeIcon mode={mode === 'all' ? 'train' : mode} />
            </div>
            <div className="route-card-info">
              <h3 className="route-card-title">{card.title}</h3>
              <p className="route-card-route">{shortOrigin} <span aria-hidden="true">→</span> {shortDest}</p>
            </div>
          </div>
          <div className="route-card-next">
            <span className="route-card-next-value">{nextService.time}</span>
            <span className="route-card-next-detail">{nextService.detail}</span>
          </div>
        </div>
        <div className="route-card-status-row">
          <div className={`route-card-badge ${isActive ? 'is-active' : ''}`}>
            <svg className="route-card-badge-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h11" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              {!isActive && <path d="M2 2l20 20" />}
            </svg>
            {alertStatus}
          </div>
          <span className="route-card-chevron" aria-hidden="true">›</span>
        </div>
      </button>

      {showMenu && (
        <div className="route-card-context-menu">
          <div className="route-card-context-backdrop" onClick={() => setShowMenu(false)} />
          <div className="route-card-context-panel">
            {onEdit && (
              <button
                className="route-card-context-item"
                onClick={() => { setShowMenu(false); onEdit(); }}
                type="button"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit route
              </button>
            )}
            {onDelete && (
              <button
                className="route-card-context-item route-card-context-item--danger"
                onClick={() => { setShowMenu(false); onDelete(); }}
                type="button"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
                Delete route
              </button>
            )}
            <button
              className="route-card-context-item"
              onClick={() => setShowMenu(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
