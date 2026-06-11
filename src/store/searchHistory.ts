/**
 * Search history for stop selection.
 * Stores the last 5 selected stops in localStorage.
 */

const STORAGE_KEY = 'trainlive:searchHistory';
const MAX_ITEMS = 5;

export interface SearchHistoryItem {
  name: string;
  stopId?: string;
  timestamp: number;
}

export function getSearchHistory(): SearchHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SearchHistoryItem[];
  } catch {
    return [];
  }
}

export function addToSearchHistory(name: string, stopId?: string): void {
  try {
    const history = getSearchHistory();
    // Remove existing entry with same name
    const filtered = history.filter((item) => item.name.toLowerCase() !== name.toLowerCase());
    // Add to front
    filtered.unshift({ name, stopId, timestamp: Date.now() });
    // Cap at MAX_ITEMS
    const capped = filtered.slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // Storage full or unavailable
  }
}

export function clearSearchHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
