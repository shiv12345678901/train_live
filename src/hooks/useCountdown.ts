import { useState, useEffect } from 'react';

/**
 * Hook that returns a live-updating "minutes until" value.
 * Ticks every second to provide real-time countdown.
 */
export function useCountdown(isoTime: string | undefined | null): number | null {
  const [minutesUntil, setMinutesUntil] = useState<number | null>(() => {
    if (!isoTime) return null;
    const diff = (new Date(isoTime).getTime() - Date.now()) / 60000;
    return Number.isFinite(diff) ? Math.max(0, Math.round(diff)) : null;
  });

  useEffect(() => {
    if (!isoTime) {
      setMinutesUntil(null);
      return;
    }

    const target = new Date(isoTime).getTime();
    if (Number.isNaN(target)) {
      setMinutesUntil(null);
      return;
    }

    const update = () => {
      const diff = (target - Date.now()) / 60000;
      setMinutesUntil(Math.max(0, Math.round(diff)));
    };

    update();
    const intervalId = window.setInterval(update, 1000);
    return () => window.clearInterval(intervalId);
  }, [isoTime]);

  return minutesUntil;
}

/**
 * Format minutes into a human-readable countdown string.
 */
export function formatCountdown(minutes: number | null): string {
  if (minutes === null) return '';
  if (minutes <= 0) return 'Due';
  if (minutes === 1) return '1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
}
