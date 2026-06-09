import { useState } from 'react';
import { StopSearchInput } from './StopSearchInput';
import type { RouteCard } from '@/types';

interface RouteCreationSheetProps {
  onSave: (data: { title: string; origin: string; destination: string; routeFilter: string[]; originStopId?: string; destinationStopId?: string }) => void;
  onCancel: () => void;
  editCard?: RouteCard;
}

export function RouteCreationSheet({ onSave, onCancel, editCard }: RouteCreationSheetProps) {
  const [title, setTitle] = useState(editCard?.title ?? '');
  const [origin, setOrigin] = useState(editCard?.origin ?? '');
  const [originStopId, setOriginStopId] = useState(editCard?.originStopId ?? '');
  const [destination, setDestination] = useState(editCard?.destination ?? '');
  const [destinationStopId, setDestinationStopId] = useState(editCard?.destinationStopId ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

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

    onSave({ title: title.trim(), origin: origin.trim(), destination: destination.trim(), routeFilter: [], originStopId: originStopId || undefined, destinationStopId: destinationStopId || undefined });
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
          onChange={(val, stopId) => { setOrigin(val); if (stopId) setOriginStopId(stopId); }}
          placeholder="Search station or stop..."
        />
        {errors.origin && <span className="form-error" style={{ marginTop: '-8px', marginBottom: '12px', display: 'block' }}>{errors.origin}</span>}
        <StopSearchInput
          id="route-destination"
          label="Destination"
          value={destination}
          onChange={(val, stopId) => { setDestination(val); if (stopId) setDestinationStopId(stopId); }}
          placeholder="Search station or stop..."
        />
        {errors.destination && <span className="form-error" style={{ marginTop: '-8px', marginBottom: '12px', display: 'block' }}>{errors.destination}</span>}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary">Save</button>
        </div>
      </form>
    </div>
  );
}
