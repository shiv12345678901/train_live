import { useEffect } from 'react';
import { APP_VISIBLE_REFRESH_MS, useAppStore } from '@/store/appStore';

export function AppDataSync() {
  const startRealtimeSync = useAppStore((state) => state.startRealtimeSync);
  const refreshAllData = useAppStore((state) => state.refreshAllData);

  useEffect(() => {
    const stopRealtimeSync = startRealtimeSync();
    let timer: ReturnType<typeof window.setInterval> | null = null;

    const refreshIfVisible = () => {
      if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
      void refreshAllData(false);
    };

    const startTimer = () => {
      if (timer) window.clearInterval(timer);
      if (document.visibilityState !== 'visible') return;
      refreshIfVisible();
      timer = window.setInterval(refreshIfVisible, APP_VISIBLE_REFRESH_MS);
    };

    const stopTimer = () => {
      if (!timer) return;
      window.clearInterval(timer);
      timer = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        startTimer();
      } else {
        stopTimer();
      }
    };

    const handleOnline = () => {
      startTimer();
    };

    startTimer();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', stopTimer);

    return () => {
      stopTimer();
      stopRealtimeSync();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', stopTimer);
    };
  }, [refreshAllData, startRealtimeSync]);

  return null;
}
