import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { TrainCard, ModeFilter } from './TrainCard';
import { TrainDetailSheet } from './TrainDetailSheet';
import { LoadingSkeleton } from './LoadingSkeleton';
import { InlineError } from './InlineError';
import { useAppStore } from '@/store/appStore';
import type { TrainDeparture } from '@/types';
import { getDepartureMode } from './transportMode';

export function RouteDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const routeCards = useAppStore((s) => s.routeCards);
  const loadRouteCards = useAppStore((s) => s.loadRouteCards);
  const liveTrains = useAppStore((s) => s.liveTrains);
  const liveTrainsLoading = useAppStore((s) => s.liveTrainsLoading);
  const liveTrainsError = useAppStore((s) => s.liveTrainsError);
  const fetchLiveTrains = useAppStore((s) => s.fetchLiveTrains);
  const setPendingAlertPrefill = useAppStore((s) => s.setPendingAlertPrefill);

  const card = routeCards.find((c) => c.id === id);
  const cardId = card?.id;
  const trains = id ? liveTrains[id] ?? [] : [];
  const isLoading = id ? liveTrainsLoading[id] ?? false : false;
  const error = id ? liveTrainsError[id] ?? null : null;
  const [filterState, setFilterState] = useState({ routeFilter: 'all', serviceLimit: 5 });
  const [selectedTrain, setSelectedTrain] = useState<TrainDeparture | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [routesLoaded, setRoutesLoaded] = useState(routeCards.length > 0);
  const { routeFilter, serviceLimit } = filterState;
  const savedMode = card?.mode ?? 'train';

  const uniqueTrains = trains.filter((train, index, list) => {
    const key = `${train.tripId}:${train.scheduledTime}:${train.platform}:${getDepartureMode(train)}`;
    return list.findIndex((item) => `${item.tripId}:${item.scheduledTime}:${item.platform}:${getDepartureMode(item)}` === key) === index;
  });

  const filteredTrains = savedMode === 'all' && routeFilter !== 'all'
    ? uniqueTrains.filter(t => getDepartureMode(t) === routeFilter)
    : savedMode === 'all'
    ? uniqueTrains
    : uniqueTrains.filter(t => getDepartureMode(t) === savedMode);

  const displayTrains = filteredTrains;
  const hasMore = uniqueTrains.length >= serviceLimit;

  const refreshLiveTrains = async () => {
    if (!id || !cardId) return;
    await fetchLiveTrains(id, serviceLimit);
    setLastUpdated(new Date());
  };

  useEffect(() => {
    let cancelled = false;
    loadRouteCards().finally(() => {
      if (!cancelled) setRoutesLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loadRouteCards]);

  useEffect(() => {
    if (id && cardId) {
      void fetchLiveTrains(id, serviceLimit).finally(() => setLastUpdated(new Date()));
    }
  }, [id, cardId, fetchLiveTrains, serviceLimit]);

  useEffect(() => {
    if (!id || !cardId) return;

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchLiveTrains(id, serviceLimit).finally(() => setLastUpdated(new Date()));
      }
    };

    const intervalId = window.setInterval(refreshIfVisible, 30000);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [cardId, fetchLiveTrains, id, serviceLimit]);

  function formatPrefillTime(isoTime: string): string {
    const date = new Date(isoTime);
    if (Number.isNaN(date.getTime())) return '';
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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
    });
    navigate('/schedule');
  };

  const handleFilter = (nextFilter: string) => {
    setFilterState({ routeFilter: nextFilter, serviceLimit: 5 });
  };

  const handleLoadMore = () => {
    setFilterState((prev) => ({ ...prev, serviceLimit: Math.min(prev.serviceLimit + 10, 50) }));
  };

  const updatedLabel = lastUpdated
    ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`
    : 'Live departures';

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
      <PageHeader title={card.title} backButton />
      <div className="route-details-meta">
        <div className="route-details-meta-copy">
          <span className="route-details-direction">{card.origin} → {card.destination}</span>
          <span className="route-details-freshness">{updatedLabel}</span>
        </div>
        <button className="route-details-refresh" type="button" onClick={refreshLiveTrains} aria-label="Refresh live departures">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 1-15.5 6.2" />
            <path d="M3 12a9 9 0 0 1 15.5-6.2" />
            <path d="M18 2v4h-4" />
            <path d="M6 22v-4h4" />
          </svg>
        </button>
      </div>
      <div className="route-details-trains">
        {isLoading && <LoadingSkeleton />}
        {error && <InlineError message={error} onRetry={refreshLiveTrains} />}
        {!isLoading && !error && uniqueTrains.length > 0 && savedMode === 'all' && (
          <ModeFilter trains={uniqueTrains} activeFilter={routeFilter} onFilter={handleFilter} />
        )}
        {!isLoading && !error && uniqueTrains.length === 0 && (
          <div className="route-details-empty-state">
            <p className="route-details-empty-title">No services found for this route</p>
            <p className="route-details-empty-copy">Check the station names or refresh live departures.</p>
            <button className="btn-secondary route-details-empty-action" type="button" onClick={refreshLiveTrains}>Refresh</button>
          </div>
        )}
        {!isLoading && !error && uniqueTrains.length > 0 && displayTrains.length === 0 && (
          <div className="route-details-empty-state">
            <p className="route-details-empty-title">No {savedMode === 'all' ? routeFilter : savedMode.replace('_', ' ')} services found</p>
            <p className="route-details-empty-copy">Refresh live departures or edit the saved route mode.</p>
          </div>
        )}
        {!isLoading && !error && displayTrains.map((train) => (
          <TrainCard
            key={`${train.tripId}:${train.scheduledTime}:${train.platform}:${getDepartureMode(train)}`}
            train={train}
            onBellTap={() => handleBellTap(train)}
            onTap={() => setSelectedTrain(train)}
          />
        ))}
        {!isLoading && !error && hasMore && serviceLimit < 50 && (
          <button
            className="btn-secondary load-more-btn"
            onClick={handleLoadMore}
            type="button"
          >
            Show more departures ({displayTrains.length} of {uniqueTrains.length}+)
          </button>
        )}
      </div>

      {/* Train Detail Sheet */}
      {selectedTrain && card && (
        <TrainDetailSheet
          train={selectedTrain}
          origin={card.origin}
          destination={card.destination}
          originStopId={card.originStopId}
          destinationStopId={card.destinationStopId}
          onClose={() => setSelectedTrain(null)}
        />
      )}
    </div>
  );
}
