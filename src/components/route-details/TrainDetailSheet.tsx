import { useEffect, useState } from 'react';
import type { TrainDeparture } from '@/types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/.netlify/functions';

interface StopInfo {
  name: string;
  arrivalTime?: string;
  departureTime?: string;
  platform?: string;
  isCurrent?: boolean;
  isPassed?: boolean;
}

interface TripData {
  route: string;
  destination: string;
  stops: StopInfo[];
}

interface TrainDetailSheetProps {
  train: TrainDeparture;
  origin: string;
  destination: string;
  originStopId?: string;
  destinationStopId?: string;
  onClose: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function TrainDetailSheet({ train, origin, destination, originStopId, destinationStopId, onClose }: TrainDetailSheetProps) {
  const [tripData, setTripData] = useState<TripData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStops = async () => {
      try {
        const params = new URLSearchParams({
          origin,
          destination,
          scheduledTime: train.scheduledTime || '',
          tripId: train.tripId || '',
          platform: train.platform || '',
          route: train.route || '',
        });
        if (originStopId) params.set('originStopId', originStopId);
        if (destinationStopId) params.set('destinationStopId', destinationStopId);
        const res = await fetch(`${API_BASE}/trip-stops?${params}`);
        if (res.ok) {
          const data = await res.json();
          if (data.stops?.length > 0) {
            setTripData(data);
          }
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    fetchStops();
  }, [destination, destinationStopId, origin, originStopId, train.platform, train.route, train.scheduledTime, train.tripId]);

  return (
    <div className="train-detail-overlay" onClick={onClose}>
      <div className="train-detail-sheet" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="train-detail-header">
          <div className="train-detail-handle" />
          <div className="train-detail-title-row">
            <div>
              <h3 className="train-detail-title">{train.route}</h3>
              <p className="train-detail-subtitle">
                {tripData?.destination || train.destination || destination.replace(/\s*Station\s*/gi, '')}
              </p>
            </div>
            <button className="train-detail-close" onClick={onClose} type="button">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Stop sequence */}
        <div className="train-detail-stops">
          {loading && (
            <div className="train-detail-loading">
              <div className="train-detail-loading-dot" />
              <span>Loading stops...</span>
            </div>
          )}

          {!loading && (!tripData || tripData.stops.length === 0) && (
            <p className="train-detail-empty">Stop details unavailable for this service</p>
          )}

          {!loading && tripData && tripData.stops.length > 0 && (
            <div className="train-detail-stop-list">
              {tripData.stops.map((stop, idx) => (
                <div
                  key={idx}
                  className={`train-detail-stop ${stop.isPassed ? 'passed' : ''} ${stop.isCurrent ? 'current' : ''}`}
                >
                  {/* Timeline */}
                  <div className="train-detail-timeline">
                    <div className={`train-detail-dot ${stop.isCurrent ? 'current' : stop.isPassed ? 'passed' : ''}`} />
                    {idx < tripData.stops.length - 1 && (
                      <div className={`train-detail-line ${stop.isPassed ? 'passed' : ''}`} />
                    )}
                  </div>

                  {/* Stop info */}
                  <div className="train-detail-stop-info">
                    <span className="train-detail-stop-name">
                      {stop.name.replace(/\s*Station\s*/gi, '').replace(/,.*$/, '')}
                    </span>
                    {stop.platform && (
                      <span className="train-detail-stop-platform">Plt {stop.platform}</span>
                    )}
                  </div>

                  {/* Time */}
                  <span className="train-detail-stop-time">
                    {stop.departureTime
                      ? formatTime(stop.departureTime)
                      : stop.arrivalTime
                        ? formatTime(stop.arrivalTime)
                        : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
