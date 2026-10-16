import { useState } from 'react';
import { StopSearchInput } from './StopSearchInput';
import { fetchLiveTrains } from '@/api/trainApi';
import { toast } from '@/components/shared/toastStore';
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
  const [mode, setMode] = useState<TransportMode>('all');
  const [departureAt, setDepartureAt] = useState('');
  const [error, setError] = useState('');

  const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!origin.trim() || !destination.trim()) {
      toast('Enter origin and destination', 'info');
      return;
    }
    if (origin.trim().toLowerCase() === destination.trim().toLowerCase()) {
      toast('Origin and destination must be different', 'error');
      return;
    }

    setLoading(true);
    setError('');
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
        mode,
        departureAt || undefined
      );
      setResults(trains);
      if (trains.length === 0) {
        toast('No services found', 'info');
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Search failed. Check connection.';
      setError(message);
      toast(message, 'error');
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
      <form className="trip-planner-form" onSubmit={handleSearch}>
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
        <div className="trip-planner-options">
          <label className="form-field" htmlFor="trip-mode">
            Transport type
            <select id="trip-mode" className="setting-select" value={mode} onChange={(event) => setMode(event.target.value as TransportMode)}>
              <option value="all">All transport</option>
              <option value="train">Train</option>
              <option value="metro">Metro</option>
              <option value="bus">Bus</option>
              <option value="light_rail">Light rail</option>
              <option value="ferry">Ferry</option>
            </select>
          </label>
          <label className="form-field" htmlFor="trip-departure">
            Depart at · Sydney time
            <input id="trip-departure" type="datetime-local" value={departureAt} onChange={(event) => setDepartureAt(event.target.value)} />
          </label>
        </div>
        <p className="trip-planner-hint">Leave the departure time blank for live services.</p>
        <button
          className="btn-primary"
          disabled={loading}
          type="submit"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && <p className="trip-planner-error" role="alert">{error}</p>}

      {/* Results */}
      {searched && !loading && results.length > 0 && (
        <div className="trip-planner-results">
          {results.map((train, i) => {
            const time = train.estimatedTime || train.scheduledTime;
            const d = new Date(time);
            const timeStr = formatTransportTime(time, '—');
            const mins = Math.max(0, Math.round((d.getTime() - searchNow) / 60000));
            const dateStr = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short' }).format(d);
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
                  <span className="trip-planner-result-mins">{departureAt ? dateStr : mins > 0 ? `${mins} min` : 'Due'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {searched && !loading && !error && results.length === 0 && (
        <p className="trip-planner-empty">No services found for these search options.</p>
      )}
    </div>
  );
}
