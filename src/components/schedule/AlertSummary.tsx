import type { AlertPrefillData } from '@/types';

interface AlertSummaryProps {
  data: AlertPrefillData;
}

export function AlertSummary({ data }: AlertSummaryProps) {
  return (
    <div className="alert-summary">
      <div className="alert-summary-title">Prefilled from train selection</div>
      <div className="alert-summary-details">
        <div className="alert-summary-row">
          <span className="alert-summary-label">Route</span>
          <span className="alert-summary-value">{data.routeTitle}</span>
        </div>
        <div className="alert-summary-row">
          <span className="alert-summary-label">Direction</span>
          <span className="alert-summary-value">{data.origin} → {data.destination}</span>
        </div>
        <div className="alert-summary-row">
          <span className="alert-summary-label">Departure</span>
          <span className="alert-summary-value">{data.departureTime}</span>
        </div>
        {data.platform && (
          <div className="alert-summary-row">
            <span className="alert-summary-label">Platform</span>
            <span className="alert-summary-value">{data.platform}</span>
          </div>
        )}
        {data.routeFilter && data.routeFilter.length > 0 && (
          <div className="alert-summary-row">
            <span className="alert-summary-label">Lines</span>
            <span className="alert-summary-value">{data.routeFilter.join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
