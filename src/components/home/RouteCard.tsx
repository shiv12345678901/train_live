import { useState, useRef, useCallback } from 'react';
import type { RouteCard as RouteCardType } from '@/types';

interface RouteCardProps {
  card: RouteCardType;
  alertStatus: string;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  index?: number;
}

// Different map tiles for variety (public OSM tiles, Sydney area)
const MAP_TILES = [
  'https://tile.openstreetmap.org/14/15125/9832.png',  // Sydney CBD
  'https://tile.openstreetmap.org/14/15124/9833.png',  // Inner West
  'https://tile.openstreetmap.org/14/15126/9834.png',  // South
  'https://tile.openstreetmap.org/14/15123/9831.png',  // Harbour
  'https://tile.openstreetmap.org/14/15127/9835.png',  // Hurstville area
  'https://tile.openstreetmap.org/14/15125/9833.png',  // Redfern area
];

// Accent colors for decorative shapes per card
const ACCENT_COLORS = [
  '#4285f4', // blue
  '#34a853', // green
  '#7c4dff', // purple
  '#00bcd4', // teal
  '#ff6d00', // orange
  '#e91e63', // pink
];

export function RouteCard({ card, alertStatus, onClick, onEdit, onDelete, index = 0 }: RouteCardProps) {
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

  const [showMenu, setShowMenu] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  // Pick map tile and color based on index for visual variety
  const mapTile = MAP_TILES[index % MAP_TILES.length];
  const accentColor = ACCENT_COLORS[index % ACCENT_COLORS.length];

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
        {/* Top row: icon + title */}
        <div className="route-card-header">
          <div className="route-card-icon" style={{ background: `${accentColor}12` }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="10" width="16" height="8" rx="2"/>
              <path d="M4 7a4 4 0 014-4h8a4 4 0 014 4v3H4V7z"/>
              <circle cx="8" cy="15" r="1.5" fill={accentColor} stroke="none"/>
              <circle cx="16" cy="15" r="1.5" fill={accentColor} stroke="none"/>
              <path d="M9 21l1.5-3h3L15 21"/>
            </svg>
          </div>
          <h3 className="route-card-title">{card.title}</h3>
        </div>

        {/* Active badge */}
        {isActive && (
          <div className="route-card-badge">
            <span className="route-card-badge-dot" />
            Active
          </div>
        )}

        {/* Route text */}
        <p className="route-card-route">{shortOrigin} → {shortDest}</p>

        {/* Map area with route line overlay */}
        <div className="route-card-map">
          <div className="route-card-map-bg" style={{ backgroundImage: `url('${mapTile}')` }} />
          {/* Decorative accent shape */}
          <svg className="route-card-map-shape" viewBox="0 0 160 56" fill="none" preserveAspectRatio="none">
            <circle cx="130" cy="45" r="18" fill={accentColor} opacity="0.08"/>
            <circle cx="25" cy="12" r="10" fill={accentColor} opacity="0.06"/>
          </svg>
          {/* Route line */}
          <svg className="route-card-map-line" viewBox="0 0 160 56" fill="none" preserveAspectRatio="xMidYMid meet">
            <path d="M12 42 Q40 42 65 28 Q90 14 120 22 Q140 27 148 18" stroke={accentColor} strokeWidth="3" strokeLinecap="round" fill="none"/>
            <circle cx="12" cy="42" r="5" fill={accentColor}/>
            <circle cx="148" cy="18" r="4.5" fill="white" stroke={accentColor} strokeWidth="2.5"/>
          </svg>
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
