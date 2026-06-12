import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { TrainCard, ModeFilter } from './TrainCard';
import { TrainDetailSheet } from './TrainDetailSheet';
import { AlertsBanner } from './AlertsBanner';
import { LoadingSkeleton } from './LoadingSkeleton';
import { InlineError } from './InlineError';
import { useAppStore } from '@/store/appStore';
import type { TrainDeparture } from '@/types';
import { formatTransportTime, formatTransportTime24 } from '@/utils/timeUtils';
import { getDepartureMode } from './transportMode';

export function RouteDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const routeCards = useAppStore((s) => s.routeCards);
  const loadRouteCards = useAppStore((s) => s.loadRouteCards);
  const liveTrains = useAppStore((s) => s.liveTrains);
  const liveTrainsLoading = useAppStore((s) => s.liveTrainsLoading);
  const liveTrainsError = useAppStore((s) => s.liveTrainsError);
  const liveTrainsUpdatedAt = useAppStore((s) => s.liveTrainsUpdatedAt);
  const fetchLiveTrains = useAppStore((s) => s.fetchLiveTrains);
  const setPendingAlertPrefill = useAppStore((s) => s.setPendingAlertPrefill);

  const card = routeCards.find((c) => c.id === id);
  const cardId = card?.id;
  const trains = id ? liveTrains[id] ?? [] : [];
  const isLoading = id ? liveTrainsLoading[id] ?? false : false;
  const error = id ? liveTrainsError[id] ?? null : null;
  const [routeFilter, setRouteFilter] = useState('all');
  const [visibleCount, setVisibleCount] = useState(10);
  const [selectedTrain, setSelectedTrain] = useState<TrainDeparture | null>(null);
  const [routesLoaded, setRoutesLoaded] = useState(routeCards.length > 0);
  const savedMode = card?.mode || 'train';

  const uniqueTrains = trains.filter((train, index, list) => {
    const key = `${train.tripId}:${train.scheduledTime}:${train.platform}:${getDepartureMode(train)}`;
    return list.findIndex((item) => `${item.tripId}:${item.scheduledTime}:${item.platform}:${getDepartureMode(item)}` === key) === index;
  });

  const filteredTrains = savedMode === 'all' && routeFilter !== 'all'
    ? uniqueTrains.filter(t => getDepartureMode(t) === routeFilter)
    : savedMode === 'all'
    ? uniqueTrains
    : uniqueTrains.filter(t => getDepartureMode(t) === savedMode);

  // Client-side pagination — no re-fetch on "show more"
  const displayTrains = filteredTrains.slice(0, visibleCount);
  const hasMore = filteredTrains.length > visibleCount;

  const refreshLiveTrains = async () => {
    if (!id || !cardId) return;
    await fetchLiveTrains(id, 20); // Always fetch 20 trains
  };

  useEffect(() => {
    let cancelled = false;
    loadRouteCards().finally(() => {
      if (!cancelled) setRoutesLoaded(true);
    });
    return () => { cancelled = true; };
  }, [loadRouteCards]);

  // Fetch trains once on mount with limit=20
  useEffect(() => {
    if (id && cardId) {
      void fetchLiveTrains(id, 20);
    }
  }, [id, cardId, fetchLiveTrains]);

  // Dynamic auto-refresh: refresh faster when a departure is near, slower when
  // the timetable is farther out, and do nothing while hidden/offline.
  useEffect(() => {
    if (!id || !cardId) return;

    let cancelled = false;
    let timeoutId: number | undefined;

    const nextDelay = () => {
      const nextTrain = uniqueTrains[0];
      if (!nextTrain) return 5 * 60 * 1000;

      const nextTime = new Date(nextTrain.estimatedTime || nextTrain.scheduledTime).getTime();
      const minutesAway = (nextTime - Date.now()) / 60000;

      if (minutesAway <= 5) return 15 * 1000;
      if (minutesAway <= 30) return 30 * 1000;
      if (minutesAway <= 120) return 60 * 1000;
      return 5 * 60 * 1000;
    };

    const scheduleNext = () => {
      if (cancelled) return;
      window.clearTimeout(timeoutId);
      if (document.visibilityState !== 'visible' || navigator.onLine === false) return;

      timeoutId = window.setTimeout(() => {
        void fetchLiveTrains(id, 20).finally(scheduleNext);
      }, nextDelay());
    };

    const refreshWhenVisible = () => {
      if (cancelled) return;
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        void fetchLiveTrains(id, 20).finally(scheduleNext);
      } else {
        window.clearTimeout(timeoutId);
      }
    };

    scheduleNext();
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('online', refreshWhenVisible);
    window.addEventListener('offline', scheduleNext);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('online', refreshWhenVisible);
      window.removeEventListener('offline', scheduleNext);
    };
  }, [cardId, fetchLiveTrains, id, uniqueTrains]);

  function formatPrefillTime(isoTime: string): string {
    return formatTransportTime24(isoTime);
  }

  const handleBellTap = (train: TrainDeparture) => {
    if (!card) return;
    const departureTime = formatPrefillTime(train.estimatedTime || train.scheduledTime);
    if (!departureTime) return;
    setPendingAlertPrefill({
      routeCardId: card.id,
      routeTitle: card.title,
      origin: card.origin,
      destination: card.destination,
      routeFilter: card.routeFilter,
      departureTime,
      tripId: train.tripId,
      platform: train.platform,
      targetRoute: train.route,
      targetDestination: train.destination || card.destination,
    });
    navigate('/schedule');
  };

  const handleFilter = (nextFilter: string) => {
    setRouteFilter(nextFilter);
    setVisibleCount(10);
  };

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + 5);
  };

  const updatedAt = id ? liveTrainsUpdatedAt[id] : undefined;
  const updatedLabel = updatedAt
    ? `Updated ${formatTransportTime(updatedAt)}`
    : 'Live departures';
  const showBlockingLoading = isLoading && displayTrains.length === 0;
  const showBlockingError = Boolean(error) && displayTrains.length === 0;

  if (!card && !routesLoaded) {
    return (
      <div>
        <PageHeader title="Route" backButton />
        <div className="route-details-trains">
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div>
        <PageHeader title="Route" backButton />
        <p className="route-details-empty">Route not found</p>
      </div>
    );
  }

  return (
    <div className="route-details-page">
      <div className="route-details-header">
        <PageHeader title={card.title} backButton />
        <div className="route-details-header-meta">
          <span className="route-details-direction">{card.origin} → {card.destination}</span>
          <span className="route-details-freshness">{updatedLabel}</span>
        </div>
        <button className={`route-details-refresh ${isLoading ? 'is-spinning' : ''}`} type="button" onClick={refreshLiveTrains} aria-label="Refresh">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 1-15.5 6.2" />
            <path d="M3 12a9 9 0 0 1 15.5-6.2" />
            <path d="M18 2v4h-4" />
            <path d="M6 22v-4h4" />
          </svg>
        </button>
      </div>
      <div className="route-details-trains">
        {showBlockingLoading && <LoadingSkeleton />}
        {error && <InlineError message={displayTrains.length > 0 ? `${error} — showing saved departures` : error} onRetry={refreshLiveTrains} />}
        {!showBlockingLoading && !showBlockingError && (() => {
          // Collect unique alerts from all trains
          const allAlerts = uniqueTrains.flatMap(t => t.alerts || []);
          const uniqueAlerts = allAlerts.filter((a, i) => allAlerts.findIndex(b => b.id === a.id || b.title === a.title) === i);
          return uniqueAlerts.length > 0 ? <AlertsBanner alerts={uniqueAlerts} /> : null;
        })()}
        {!showBlockingLoading && !showBlockingError && uniqueTrains.length > 0 && savedMode === 'all' && (
          <ModeFilter trains={uniqueTrains} activeFilter={routeFilter} onFilter={handleFilter} />
        )}
        {!showBlockingLoading && !showBlockingError && uniqueTrains.length === 0 && (
          <div className="route-details-empty-state">
            <p className="route-details-empty-title">No services found for this route</p>
            <p className="route-details-empty-copy">Check the station names or refresh live departures.</p>
            <button className="btn-secondary route-details-empty-action" type="button" onClick={refreshLiveTrains}>Refresh</button>
          </div>
        )}
        {!showBlockingLoading && !showBlockingError && uniqueTrains.length > 0 && displayTrains.length === 0 && (
          <div className="route-details-empty-state">
            <p className="route-details-empty-title">No {savedMode === 'all' ? routeFilter : savedMode.replace('_', ' ')} services found</p>
            <p className="route-details-empty-copy">Refresh live departures or edit the saved route mode.</p>
          </div>
        )}
        {!showBlockingLoading && !showBlockingError && displayTrains.map((train) => {
          const isSelected = selectedTrain?.tripId === train.tripId && selectedTrain?.scheduledTime === train.scheduledTime;
          return (
          <div key={`${train.tripId}:${train.scheduledTime}:${train.platform}:${getDepartureMode(train)}`} className={isSelected ? 'train-card-with-detail' : ''}>
            <TrainCard
              train={train}
              onBellTap={() => handleBellTap(train)}
              onTap={() => setSelectedTrain(isSelected ? null : train)}
            />
            {isSelected && card && (
              <TrainDetailSheet
                train={train}
                origin={card.origin}
                destination={card.destination}
                originStopId={card.originStopId}
                destinationStopId={card.destinationStopId}
                onClose={() => setSelectedTrain(null)}
              />
            )}
          </div>
          );
        })}
        {!showBlockingLoading && !showBlockingError && hasMore && (
          <button
            className="btn-secondary load-more-btn"
            onClick={handleLoadMore}
            type="button"
          >
            Show more
          </button>
        )}
      </div>
    </div>
  );
}
