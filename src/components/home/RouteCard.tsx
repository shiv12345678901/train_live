import { useState, useRef, useCallback } from 'react';
import type { RouteCard as RouteCardType, TrainDeparture } from '@/types';

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

function getNextLabel(train?: TrainDeparture): string {
  if (!train) return 'Tap for live times';
  const time = formatTime(train.estimatedTime || train.scheduledTime);
  if (train.cancelled) return `${time} cancelled`;
  if (train.status === 'delayed' && train.delayMinutes) return `${time} · ${train.delayMinutes} min late`;
  return `${time} · ${train.status === 'unknown' ? 'Live status unavailable' : 'On time'}`;
}

export function RouteCard({ card, alertStatus, nextTrain, onClick, onEdit, onDelete, index = 0 }: RouteCardProps) {
  // Shorten station names aggressively for card display
  const shorten = (name: string) => {
    return name
      .replace(/\s*(Station|Wharf|Light Rail|,\s*.*$)/gi, '')
      .replace(/\s+at\s+.*$/i, '')
      .replace(/\s+via\s+.*$/i, '')
      .trim();
  };
  const shortOrigin = shorten(card.origin);
  const shortDest = shorten(card.destination);
  const isActive = alertStatus === 'Alert set';
  const nextLabel = getNextLabel(nextTrain);

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

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerLeave = useCallback(() => {
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
        className="route-card"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        type="button"
      >
        <div className="route-card-main">
          <div className="route-card-header">
            <div className="route-card-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="10" width="16" height="8" rx="2"/>
                <path d="M4 7a4 4 0 014-4h8a4 4 0 014 4v3H4V7z"/>
                <circle cx="8" cy="15" r="1.5" fill="currentColor" stroke="none"/>
                <circle cx="16" cy="15" r="1.5" fill="currentColor" stroke="none"/>
                <path d="M9 21l1.5-3h3L15 21"/>
              </svg>
            </div>
            <div className="route-card-info">
              <h3 className="route-card-title">{card.title}</h3>
              <p className="route-card-route">{shortOrigin} → {shortDest}</p>
            </div>
          </div>
          <div className="route-card-next">
            <span className="route-card-next-label">Next</span>
            <span className="route-card-next-value">{nextLabel}</span>
          </div>
        </div>
        <div className="route-card-status-row">
          <div className={`route-card-badge ${isActive ? 'is-active' : ''}`}>
            <span className="route-card-badge-dot" />
            {alertStatus}
          </div>
          <span className="route-card-chevron" aria-hidden="true">›</span>
        </div>
      </button>

      {/* Context menu (long-press) */}
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
