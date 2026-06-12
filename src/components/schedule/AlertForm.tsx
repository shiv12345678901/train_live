import { useState } from 'react';
import type { AlertPrefillData, RouteCard } from '@/types';

interface AlertFormProps {
  prefillData?: AlertPrefillData | null;
  routeCards: RouteCard[];
  onSave: (formData: AlertFormData) => void;
  onCancel: () => void;
}

export interface AlertFormData {
  routeCardId: string;
  title: string;
  departureTime: string;
  days: number[];
  oneTimeDate?: string;
  tripId?: string;
  platform?: string;
  targetRoute?: string;
  targetDestination?: string;
}

const DAY_OPTIONS = [
  { value: 1, label: 'M', full: 'Monday' },
  { value: 2, label: 'T', full: 'Tuesday' },
  { value: 3, label: 'W', full: 'Wednesday' },
  { value: 4, label: 'T', full: 'Thursday' },
  { value: 5, label: 'F', full: 'Friday' },
  { value: 6, label: 'S', full: 'Saturday' },
  { value: 0, label: 'S', full: 'Sunday' },
];

function formatTimeDisplay(time: string): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function getTodayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function AlertForm({ prefillData, routeCards, onSave, onCancel }: AlertFormProps) {
  const [selectedRouteId, setSelectedRouteId] = useState(prefillData?.routeCardId || '');
  const [title, setTitle] = useState(prefillData?.routeTitle || '');
  const [departureTime, setDepartureTime] = useState(prefillData?.departureTime || '');
  const [isRecurring, setIsRecurring] = useState(true);
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [oneTimeDate, setOneTimeDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedRoute = routeCards.find((r) => r.id === selectedRouteId);

  const handleRouteSelect = (routeId: string) => {
    setSelectedRouteId(routeId);
    const route = routeCards.find((r) => r.id === routeId);
    if (route && !title) {
      setTitle(route.title);
    }
  };

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const selectPreset = (preset: 'weekdays' | 'weekends' | 'daily') => {
    switch (preset) {
      case 'weekdays': setSelectedDays([1, 2, 3, 4, 5]); break;
      case 'weekends': setSelectedDays([0, 6]); break;
      case 'daily': setSelectedDays([0, 1, 2, 3, 4, 5, 6]); break;
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!selectedRouteId) newErrors.route = 'Select a route';
    if (!title.trim()) newErrors.title = 'Title is required';
    if (!departureTime) newErrors.departureTime = 'Select a departure time';
    if (isRecurring && selectedDays.length === 0) newErrors.days = 'Select at least one day';
    if (!isRecurring && !oneTimeDate) newErrors.oneTimeDate = 'Select a date';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    onSave({
      routeCardId: selectedRouteId,
      title: title.trim(),
      departureTime,
      days: isRecurring ? selectedDays : [],
      oneTimeDate: !isRecurring ? oneTimeDate : undefined,
      tripId: prefillData?.tripId,
      platform: prefillData?.platform || undefined,
      targetRoute: prefillData?.targetRoute,
      targetDestination: prefillData?.targetDestination,
    });
  };

  return (
    <form className="alert-form" onSubmit={handleSubmit}>
      {/* Route Selection */}
      <div className="alert-form-section">
        <label className="alert-form-label" htmlFor="alert-route-select">Select route</label>
        {routeCards.length === 0 ? (
          <p className="alert-form-empty">No saved routes. Create a route on the Home tab first.</p>
        ) : (
          <select
            id="alert-route-select"
            className="alert-form-input"
            value={selectedRouteId}
            onChange={(e) => handleRouteSelect(e.target.value)}
          >
            <option value="">— Choose a route —</option>
            {routeCards.map((route) => {
              const shortOrigin = route.origin.replace(/\s*(Station|Wharf|Light Rail)\s*/gi, '').trim();
              const shortDest = route.destination.replace(/\s*(Station|Wharf|Light Rail)\s*/gi, '').trim();
              return (
                <option key={route.id} value={route.id}>
                  {route.title} ({shortOrigin} → {shortDest})
                </option>
              );
            })}
          </select>
        )}
        {errors.route && <span className="form-error">{errors.route}</span>}
      </div>

      {/* Selected route info */}
      {selectedRoute && (
        <div className="alert-form-route-info">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="M12 5l7 7-7 7" />
          </svg>
          <span>{selectedRoute.origin.replace(/\s*Station\s*/gi, '')} → {selectedRoute.destination.replace(/\s*Station\s*/gi, '')}</span>
        </div>
      )}

      {/* Alert Name */}
      <div className="alert-form-section">
        <label className="alert-form-label" htmlFor="alert-title">Alert name</label>
        <input
          id="alert-title"
          className="alert-form-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Morning commute"
        />
        {errors.title && <span className="form-error">{errors.title}</span>}
      </div>

      {/* Time Picker */}
      <div className="alert-form-section">
        <label className="alert-form-label" htmlFor="alert-departure-time">Departure time</label>
        <input
          id="alert-departure-time"
          className="alert-form-input"
          type="time"
          value={departureTime}
          onChange={(e) => setDepartureTime(e.target.value)}
        />
        {errors.departureTime && <span className="form-error">{errors.departureTime}</span>}
      </div>

      {/* Schedule Type Toggle */}
      <div className="alert-form-section">
        <label className="alert-form-label">Repeat</label>
        <div className="alert-form-schedule-type">
          <button
            type="button"
            className={`alert-form-type-btn ${isRecurring ? 'active' : ''}`}
            onClick={() => setIsRecurring(true)}
          >
            Recurring
          </button>
          <button
            type="button"
            className={`alert-form-type-btn ${!isRecurring ? 'active' : ''}`}
            onClick={() => setIsRecurring(false)}
          >
            One-time
          </button>
        </div>
      </div>

      {/* Day selector or Date picker */}
      {isRecurring ? (
        <div className="alert-form-section">
          <div className="alert-form-day-presets">
            <button type="button" className="alert-form-preset-btn" onClick={() => selectPreset('weekdays')}>Weekdays</button>
            <button type="button" className="alert-form-preset-btn" onClick={() => selectPreset('weekends')}>Weekends</button>
            <button type="button" className="alert-form-preset-btn" onClick={() => selectPreset('daily')}>Daily</button>
          </div>
          <div className="alert-form-days">
            {DAY_OPTIONS.map((day) => (
              <button
                key={day.value}
                type="button"
                className={`alert-form-day-btn ${selectedDays.includes(day.value) ? 'active' : ''}`}
                onClick={() => toggleDay(day.value)}
                title={day.full}
              >
                {day.label}
              </button>
            ))}
          </div>
          {errors.days && <span className="form-error">{errors.days}</span>}
        </div>
      ) : (
        <div className="alert-form-section">
          <label className="alert-form-label" htmlFor="alert-one-time-date">Date</label>
          <input
            id="alert-one-time-date"
            className="alert-form-input"
            type="date"
            value={oneTimeDate}
            min={getTodayString()}
            onChange={(e) => setOneTimeDate(e.target.value)}
          />
          {oneTimeDate && (
            <span className="alert-form-date-display">{formatDateDisplay(oneTimeDate)}</span>
          )}
          {errors.oneTimeDate && <span className="form-error">{errors.oneTimeDate}</span>}
        </div>
      )}

      {/* Summary */}
      {departureTime && selectedRoute && (
        <div className="alert-form-summary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span>
            Watch the selected service at {formatTimeDisplay(departureTime)}. Reminders: 25, 20, 10 and 5 min. Delay checks repeat every 2 min; cancellations auto-switch to the next matching service.
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="alert-form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary">Set alert</button>
      </div>
    </form>
  );
}
