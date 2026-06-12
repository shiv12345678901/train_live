import { useEffect, useMemo, useState } from 'react';
import { StopSearchInput } from './StopSearchInput';
import { fetchLiveTrains } from '@/api/trainApi';
import type { RouteCard, TransportMode } from '@/types';

const MODE_OPTIONS: Array<{ mode: TransportMode; label: string }> = [
  { mode: 'train', label: 'Train' },
  { mode: 'bus', label: 'Bus' },
  { mode: 'light_rail', label: 'Light rail' },
  { mode: 'metro', label: 'Metro' },
  { mode: 'ferry', label: 'Ferry' },
  { mode: 'all', label: 'All' },
];

interface RouteCreationSheetProps {
  onSave: (data: { title: string; origin: string; destination: string; mode: TransportMode; routeFilter: string[]; originStopId?: string; destinationStopId?: string }) => void;
  onCancel: () => void;
  editCard?: RouteCard;
}

export function RouteCreationSheet({ onSave, onCancel, editCard }: RouteCreationSheetProps) {
  const [title, setTitle] = useState(editCard?.title ?? '');
  const [origin, setOrigin] = useState(editCard?.origin ?? '');
  const [originStopId, setOriginStopId] = useState(editCard?.originStopId ?? '');
  const [destination, setDestination] = useState(editCard?.destination ?? '');
  const [destinationStopId, setDestinationStopId] = useState(editCard?.destinationStopId ?? '');
  const [mode, setMode] = useState<TransportMode>(editCard?.mode ?? 'train');
  const [availableModes, setAvailableModes] = useState<TransportMode[]>([]);
  const [modesLoading, setModesLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const canFetchModes = Boolean(origin.trim() && destination.trim() && origin.trim().toLowerCase() !== destination.trim().toLowerCase());

  useEffect(() => {
    if (!canFetchModes) return;

    let active = true;
    const timer = window.setTimeout(() => {
      setModesLoading(true);
      fetchLiveTrains(
        '__mode_probe__',
        origin.trim(),
        destination.trim(),
        originStopId || undefined,
        destinationStopId || undefined,
        20,
        'all'
      )
        .then((departures) => {
          if (!active) return;
          const modes = Array.from(new Set(departures.map((departure) => departure.transportType).filter(Boolean))) as TransportMode[];
          setAvailableModes(modes);
        })
        .catch(() => {
          if (active) setAvailableModes([]);
        })
        .finally(() => {
          if (active) setModesLoading(false);
        });
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [canFetchModes, destination, destinationStopId, origin, originStopId]);

  const visibleModeOptions = useMemo(() => {
    const modes = new Set<TransportMode>(['train', 'all', mode, ...(canFetchModes ? availableModes : [])]);
    return MODE_OPTIONS.filter((option) => modes.has(option.mode));
  }, [availableModes, canFetchModes, mode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!title.trim()) newErrors.title = 'Title is required';
    if (!origin.trim()) newErrors.origin = 'Origin is required';
    if (!destination.trim()) newErrors.destination = 'Destination is required';
    if (origin.trim() && destination.trim() && origin.trim().toLowerCase() === destination.trim().toLowerCase()) {
      newErrors.destination = 'Destination must be different from origin';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    onSave({ title: title.trim(), origin: origin.trim(), destination: destination.trim(), mode, routeFilter: [], originStopId: originStopId || undefined, destinationStopId: destinationStopId || undefined });
  };

  return (
    <div className="route-creation-sheet">
      <h2>{editCard ? 'Edit Route' : 'Create Route'}</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="route-title">Title</label>
          <input id="route-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My commute" />
          {errors.title && <span className="form-error">{errors.title}</span>}
        </div>
        <StopSearchInput
          id="route-origin"
          label="Origin"
          value={origin}
          onChange={(val, stopId) => { setOrigin(val); setOriginStopId(stopId ?? ''); }}
          placeholder="Search station or stop..."
        />
        {errors.origin && <span className="form-error" style={{ marginTop: '-8px', marginBottom: '12px', display: 'block' }}>{errors.origin}</span>}
        <StopSearchInput
          id="route-destination"
          label="Destination"
          value={destination}
          onChange={(val, stopId) => { setDestination(val); setDestinationStopId(stopId ?? ''); }}
          placeholder="Search station or stop..."
        />
        {errors.destination && <span className="form-error" style={{ marginTop: '-8px', marginBottom: '12px', display: 'block' }}>{errors.destination}</span>}
        <div className="form-field">
          <div className="mode-field-header">
            <label>Mode</label>
            <span>{canFetchModes && modesLoading ? 'Checking live options' : canFetchModes && availableModes.length > 0 ? 'Live options found' : 'Train is default'}</span>
          </div>
          <div className="route-mode-selector" role="radiogroup" aria-label="Transport mode">
            {visibleModeOptions.map((option) => (
              <button
                key={option.mode}
                type="button"
                className={`route-mode-option ${mode === option.mode ? 'is-selected' : ''}`}
                onClick={() => setMode(option.mode)}
                role="radio"
                aria-checked={mode === option.mode}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
