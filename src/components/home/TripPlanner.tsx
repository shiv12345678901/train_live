import { useState } from 'react';
import { StopSearchInput } from './StopSearchInput';
import { fetchLiveTrains } from '@/api/trainApi';
import { toast } from '@/components/shared/Toast';
import type { TrainDeparture, TransportMode } from '@/types';

interface TripPlannerProps {
  onClose: () => void;
}

export function TripPlanner({ onClose }: TripPlannerProps) {
  const [origin, setOrigin] = useState('');
  const [originStopId, setOriginStopId] = useState('');
  const [destination, setDestination] = useState('');
  const [destinationStopId, setDestinationStopId] = useState('');
  const [results, setResults] = useState<TrainDeparture[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

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
    try {
      const trains = await fetchLiveTrains(
        '__trip_plan__',
        origin.trim(),
        destination.trim(),
        originStopId || undefined,
        destinationStopId || undefined,
        10,
        'all' as TransportMode
      );
      setResults(trains);
      if (trains.length === 0) {
        toast('No services found for this route', 'info');
      }
    } catch {
      toast('Failed to search. Check your connection.', 'error');
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
            const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
            const mins = Math.max(0, Math.round((d.getTime() - Date.now()) / 60000));
            return (
              <div key={`${train.tripId}-${i}`} className="trip-planner-result">
                <div className="trip-planner-result-left">
                  <span className="trip-planner-result-route">{train.route}</span>
                  <span className="trip-planner-result-dest">{train.destination}</span>
                  {train.platform && <span className="trip-planner-result-platform">Plt {train.platform}</span>}
                </div>
                <div className="trip-planner-result-right">
                  <span className="trip-planner-result-time">{timeStr}</span>
                  <span className="trip-planner-result-mins">{mins > 0 ? `${mins} min` : 'Due'}</span>
                  {train.fareEstimate && (
                    <span className="trip-planner-result-fare">
                      ${(train.fareEstimate.isPeakNow ? train.fareEstimate.adultPeak : train.fareEstimate.adultOffPeak).toFixed(2)}
                    </span>
                  )}
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
