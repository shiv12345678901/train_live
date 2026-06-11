import { useState, useRef, useEffect } from 'react';
import { searchPresetStops, type PresetStop } from '@/data/stops';
import { getSearchHistory, addToSearchHistory, type SearchHistoryItem } from '@/store/searchHistory';

interface StopResult {
  id: string;
  name: string;
  type: string;
  locality: string;
}

interface StopSearchInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string, stopId?: string) => void;
  placeholder?: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/.netlify/functions';

export function StopSearchInput({ id, label, value, onChange, placeholder }: StopSearchInputProps) {
  const [query, setQuery] = useState(value);
  const [presetResults, setPresetResults] = useState<PresetStop[]>([]);
  const [apiResults, setApiResults] = useState<StopResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearchingApi, setIsSearchingApi] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchApi = async (searchQuery: string) => {
    if (searchQuery.trim().length < 3) {
      setApiResults([]);
      return;
    }

    setIsSearchingApi(true);
    try {
      const res = await fetch(`${API_BASE}/stops-search?q=${encodeURIComponent(searchQuery.trim())}`);
      if (res.ok) {
        const data: StopResult[] = await res.json();
        // Filter out results that are already in preset matches
        const presetNames = new Set(presetResults.map(p => p.name.toLowerCase()));
        const filtered = data.filter(d => !presetNames.has(d.name.toLowerCase()));
        setApiResults(filtered);
      }
    } catch {
      setApiResults([]);
    } finally {
      setIsSearchingApi(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);
    onChange(newValue, undefined);

    // Instant local search (no delay)
    const localResults = searchPresetStops(newValue);
    setPresetResults(localResults);
    setIsOpen(localResults.length > 0 || newValue.trim().length >= 3);

    // Debounced API search for anything not found locally
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (newValue.trim().length >= 3) {
      debounceRef.current = setTimeout(() => {
        searchApi(newValue);
      }, 400);
    } else {
      setApiResults([]);
    }
  };

  const handleSelect = (name: string, stopId?: string) => {
    setQuery(name);
    onChange(name, stopId);
    setIsOpen(false);
    setPresetResults([]);
    setApiResults([]);
    addToSearchHistory(name, stopId);
  };

  const handleFocus = () => {
    // Show results based on current query
    if (!query.trim()) {
      // Show recent search history first, then popular stops
      const history = getSearchHistory();
      if (history.length > 0) {
        const historyAsPreset: PresetStop[] = history.map((h: SearchHistoryItem) => ({
          name: h.name,
          stopId: h.stopId,
          type: 'station' as const,
          zone: 'Recent',
        }));
        setPresetResults(historyAsPreset);
      } else {
        const popular = searchPresetStops('Station').slice(0, 8);
        setPresetResults(popular);
      }
      setIsOpen(true);
    } else {
      // Re-run local search for the current value so dropdown can open
      const localResults = searchPresetStops(query);
      setPresetResults(localResults);
      if (localResults.length > 0 || apiResults.length > 0) {
        setIsOpen(true);
      } else if (query.trim().length >= 3) {
        setIsOpen(true);
        searchApi(query);
      }
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'station':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 11V7a4 4 0 014-4h8a4 4 0 014 4v4" />
            <rect x="4" y="11" width="16" height="8" rx="2" />
            <path d="M9 23l3-3 3 3" />
            <circle cx="8" cy="15" r="1" fill="currentColor" />
            <circle cx="16" cy="15" r="1" fill="currentColor" />
          </svg>
        );
      case 'wharf':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 20c2-1 4-1 6 0s4 1 6 0 4-1 6 0" />
            <path d="M12 16V4" />
            <path d="M12 4l6 4-6 4" />
          </svg>
        );
      case 'light_rail':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="4" width="12" height="14" rx="3" />
            <path d="M9 22l1.5-4h3L15 22" />
            <circle cx="9" cy="14" r="1" fill="currentColor" />
            <circle cx="15" cy="14" r="1" fill="currentColor" />
            <path d="M6 9h12" />
          </svg>
        );
      case 'metro':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 4h12a2 2 0 012 2v10a4 4 0 01-4 4H8a4 4 0 01-4-4V6a2 2 0 012-2z" />
            <path d="M9 22l1-2h4l1 2" />
            <circle cx="9" cy="14" r="1" fill="currentColor" />
            <circle cx="15" cy="14" r="1" fill="currentColor" />
            <path d="M8 4l4 6 4-6" />
          </svg>
        );
      case 'bus_stop':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="3" width="16" height="16" rx="3" />
            <path d="M4 10h16" />
            <path d="M8 21v-2" />
            <path d="M16 21v-2" />
            <circle cx="7.5" cy="15" r="1" fill="currentColor" />
            <circle cx="16.5" cy="15" r="1" fill="currentColor" />
          </svg>
        );
      default:
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4" />
            <path d="M12 18v4" />
            <path d="M4.93 4.93l2.83 2.83" />
            <path d="M16.24 16.24l2.83 2.83" />
            <path d="M2 12h4" />
            <path d="M18 12h4" />
          </svg>
        );
    }
  };

  const hasResults = presetResults.length > 0 || apiResults.length > 0;

  return (
    <div className="form-field stop-search-field" ref={containerRef}>
      <label htmlFor={id}>{label}</label>
      <div className="stop-search-input-wrapper">
        <input
          id={id}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          autoComplete="off"
        />
        {isSearchingApi && <span className="stop-search-spinner" />}
      </div>
      {isOpen && hasResults && (
        <ul className="stop-search-dropdown" role="listbox">
          {/* Preset (local) results first — instant */}
          {presetResults.slice(0, 8).map((stop) => (
            <li
              key={`preset-${stop.name}`}
              className="stop-search-option"
              role="option"
              onClick={() => handleSelect(stop.name, stop.stopId)}
            >
              <span className="stop-search-option-icon">{getTypeIcon(stop.type)}</span>
              <div className="stop-search-option-text">
                <span className="stop-search-option-name">{stop.name}</span>
                <span className="stop-search-option-locality">{stop.zone}</span>
              </div>
            </li>
          ))}
          {/* API results below — slower but comprehensive */}
          {apiResults.slice(0, 6).map((stop) => (
            <li
              key={`api-${stop.id || stop.name}`}
              className="stop-search-option"
              role="option"
              onClick={() => handleSelect(stop.name, stop.id)}
            >
              <span className="stop-search-option-icon">{getTypeIcon(stop.type)}</span>
              <div className="stop-search-option-text">
                <span className="stop-search-option-name">{stop.name}</span>
                {stop.locality && <span className="stop-search-option-locality">{stop.locality} · via API</span>}
              </div>
            </li>
          ))}
          {isSearchingApi && presetResults.length === 0 && (
            <li className="stop-search-option stop-search-loading">
              <span className="stop-search-option-icon">⏳</span>
              <div className="stop-search-option-text">
                <span className="stop-search-option-name">Searching more stops...</span>
              </div>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
