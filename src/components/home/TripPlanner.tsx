import { useState } from 'react';
import { StopSearchInput } from './StopSearchInput';
import { fetchLiveTrains } from '@/api/trainApi';
import { toast } from '@/components/shared/Toast';
import { PRESET_STOPS } from '@/data/stops';
import type { TrainDeparture, TransportMode } from '@/types';
import { formatTransportTime } from '@/utils/timeUtils';

interface TripPlannerProps {
  onClose: () => void;
}

function getStopId(name: string, manualId: string): string | undefined {
  if (manualId) return manualId;
  const preset = PRESET_STOPS.find((s) => s.name.toLowerCase() === name.toLowerCase());
  return preset?.stopId;
}

export function TripPlanner({ onClose }: TripPlannerProps) {
  const [origin, setOrigin] = useState('');
  const [originStopId, setOriginStopId] = useState('');
  const [destination, setDestination] = useState('');
  const [destinationStopId, setDestinationStopId] = useState('');
  const [results, setResults] = useState<TrainDeparture[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchNow, setSearchNow] = useState(() => Date.now());

  const handleSearch = async () => {
    if (!origin.trim() || !destination.trim()) {
      toast('Enter origin and destination', 'info');
      return;
    }
    if (origin.trim().toLowerCase() === destination.trim().toLowerCase()) {
      toast('Origin and destination must be different', 'error');
      return;
    }

    setLoading(true);
    setSearched(true);
    setSearchNow(Date.now());
    try {
      const resolvedOriginId = getStopId(origin.trim(), originStopId);
      const resolvedDestId = getStopId(destination.trim(), destinationStopId);

      const trains = await fetchLiveTrains(
        '__trip_plan__',
        origin.trim(),
        destination.trim(),
        resolvedOriginId,
        resolvedDestId,
        10,
        'all' as TransportMode
      );
      setResults(trains);
      if (trains.length === 0) {
        toast('No services found', 'info');
      }
    } catch {
      toast('Search failed. Check connection.', 'error');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="trip-planner">
      <div className="trip-planner-header">
        <h2 className="trip-planner-title">Plan a trip</h2>
        <button className="trip-planner-close" onClick={onClose} type="button">✕</button>
      </div>
      <div className="trip-planner-form">
        <StopSearchInput
          id="trip-origin"
          label="From"
          value={origin}
          onChange={(val, stopId) => { setOrigin(val); setOriginStopId(stopId ?? ''); }}
          placeholder="Origin station..."
        />
        <StopSearchInput
          id="trip-dest"
          label="To"
          value={destination}
          onChange={(val, stopId) => { setDestination(val); setDestinationStopId(stopId ?? ''); }}
          placeholder="Destination station..."
        />
        <button
          className="btn-primary"
          onClick={handleSearch}
          disabled={loading}
          type="button"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Results */}
      {searched && !loading && results.length > 0 && (
        <div className="trip-planner-results">
          {results.map((train, i) => {
            const time = train.estimatedTime || train.scheduledTime;
            const d = new Date(time);
            const timeStr = formatTransportTime(time, '—');
            const mins = Math.max(0, Math.round((d.getTime() - searchNow) / 60000));
            return (
              <div key={`${train.tripId}-${i}`} className="trip-planner-result">
                <div className="trip-planner-result-left">
                  <span className="trip-planner-result-route">{train.route || '—'}</span>
                  <span className="trip-planner-result-dest">
                    → {(train.destination || '').replace(/,.*$/, '').replace(/\s*Station\s*/gi, '')}
                  </span>
                  {train.platform && <span className="trip-planner-result-platform">Platform {train.platform}</span>}
                </div>
                <div className="trip-planner-result-right">
                  <span className="trip-planner-result-time">{timeStr}</span>
                  <span className="trip-planner-result-mins">{mins > 0 ? `${mins} min` : 'Due'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {searched && !loading && results.length === 0 && (
        <p className="trip-planner-empty">No services found. Try different stations.</p>
      )}
    </div>
  );
}
