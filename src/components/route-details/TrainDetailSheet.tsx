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

function cleanName(name: string): string {
  return name.replace(/\s*Station\s*/gi, '').replace(/,.*$/, '').trim();
}

export function TrainDetailSheet({ train, origin, destination, originStopId, destinationStopId, onClose }: TrainDetailSheetProps) {
  const [tripData, setTripData] = useState<TripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetchStops = async () => {
      try {
        const params = new URLSearchParams({
          origin, destination,
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
          if (data.stops?.length > 0) setTripData(data);
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    fetchStops();
  }, [destination, destinationStopId, origin, originStopId, train.platform, train.route, train.scheduledTime, train.tripId]);

  if (loading) {
    return <div className="train-detail-mini"><span className="train-detail-mini-loading">Loading stops...</span></div>;
  }

  if (!tripData || tripData.stops.length === 0) {
    return null;
  }

  const stops = tripData.stops;
  const originLower = origin.toLowerCase().replace(/\s*station\s*/gi, '').trim();
  const destLower = destination.toLowerCase().replace(/\s*station\s*/gi, '').trim();

  // Build condensed view: first stop, ... middle ..., last stop
  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];
  const middleIndex = Math.floor(stops.length / 2);
  const middleStop = stops.length > 2 ? stops[middleIndex] : null;
  const skippedBefore = middleIndex - 1;
  const skippedAfter = stops.length - middleIndex - 2;

  if (expanded) {
    return (
      <div className="train-detail-mini expanded">
        <div className="train-detail-mini-header">
          <span className="train-detail-mini-route">{train.route} → {cleanName(tripData.destination)}</span>
          <button className="train-detail-mini-close" onClick={onClose} type="button">✕</button>
        </div>
        <div className="train-detail-mini-stops">
          {stops.map((stop, idx) => {
            const sn = stop.name.toLowerCase().replace(/\s*station\s*/gi, '').replace(/,.*$/, '').trim();
            const isO = sn.includes(originLower) || originLower.includes(sn);
            const isD = sn.includes(destLower) || destLower.includes(sn);
            return (
              <div key={idx} className={`train-detail-mini-stop ${stop.isPassed ? 'passed' : ''} ${isO || isD || stop.isCurrent ? 'highlight' : ''}`}>
                <div className={`train-detail-mini-dot ${stop.isPassed ? 'passed' : ''} ${stop.isCurrent ? 'current' : ''} ${isO ? 'origin' : ''} ${isD ? 'dest' : ''}`} />
                <span className="train-detail-mini-name">
                  {cleanName(stop.name)}
                  {isO && <span className="tdm-badge">Get on</span>}
                  {isD && <span className="tdm-badge dest">Get off</span>}
                </span>
                <span className="train-detail-mini-time">
                  {stop.departureTime ? formatTime(stop.departureTime) : stop.arrivalTime ? formatTime(stop.arrivalTime) : ''}
                </span>
              </div>
            );
          })}
        </div>
        <button className="train-detail-mini-toggle" onClick={() => setExpanded(false)} type="button">Show less</button>
      </div>
    );
  }

  // Condensed view
  return (
    <div className="train-detail-mini">
      <div className="train-detail-mini-stops">
        <div className="train-detail-mini-stop highlight">
          <div className="train-detail-mini-dot origin" />
          <span className="train-detail-mini-name">{cleanName(firstStop.name)}<span className="tdm-badge">Get on</span></span>
          <span className="train-detail-mini-time">{firstStop.departureTime ? formatTime(firstStop.departureTime) : ''}</span>
        </div>

        {skippedBefore > 0 && (
          <div className="train-detail-mini-skip">
            <div className="train-detail-mini-dot-line" />
            <span>{skippedBefore} stop{skippedBefore > 1 ? 's' : ''}</span>
          </div>
        )}

        {middleStop && (
          <div className="train-detail-mini-stop">
            <div className="train-detail-mini-dot" />
            <span className="train-detail-mini-name">{cleanName(middleStop.name)}</span>
            <span className="train-detail-mini-time">{middleStop.departureTime ? formatTime(middleStop.departureTime) : middleStop.arrivalTime ? formatTime(middleStop.arrivalTime) : ''}</span>
          </div>
        )}

        {skippedAfter > 0 && (
          <div className="train-detail-mini-skip">
            <div className="train-detail-mini-dot-line" />
            <span>{skippedAfter} stop{skippedAfter > 1 ? 's' : ''}</span>
          </div>
        )}

        <div className="train-detail-mini-stop highlight">
          <div className="train-detail-mini-dot dest" />
          <span className="train-detail-mini-name">{cleanName(lastStop.name)}<span className="tdm-badge dest">Get off</span></span>
          <span className="train-detail-mini-time">{lastStop.arrivalTime ? formatTime(lastStop.arrivalTime) : lastStop.departureTime ? formatTime(lastStop.departureTime) : ''}</span>
        </div>
      </div>
      <button className="train-detail-mini-toggle" onClick={() => setExpanded(true)} type="button">
        Show all {stops.length} stops
      </button>
    </div>
  );
}
