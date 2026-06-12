import { useState } from 'react';
import type { ServiceAlert } from '@/types';

interface AlertsBannerProps {
  alerts: ServiceAlert[];
}

export function AlertsBanner({ alerts }: AlertsBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) return null;

  const hasCritical = alerts.some((a) => a.severity === 'critical');

  return (
    <div className={`alerts-banner ${hasCritical ? 'critical' : ''}`}>
      <button
        className="alerts-banner-header"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.29 3.86l-8.6 14.86A2 2 0 003.4 22h17.2a2 2 0 001.71-3.28l-8.6-14.86a2 2 0 00-3.42 0z" />
        </svg>
        <span>{alerts.length} alert{alerts.length > 1 ? 's' : ''} on this route</span>
        <svg className={`alerts-banner-chevron ${expanded ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {expanded && (
        <div className="alerts-banner-list">
          {alerts.map((alert) => (
            <div key={alert.id} className={`alerts-banner-item ${alert.severity || 'info'}`}>
              <span className="alerts-banner-item-title">{alert.title}</span>
              {alert.description && alert.description !== alert.title && (
                <span className="alerts-banner-item-desc">{alert.description}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
