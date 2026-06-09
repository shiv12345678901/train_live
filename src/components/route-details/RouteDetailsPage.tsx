import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { TrainCard, ModeFilter, getTransportMode } from './TrainCard';
import { TrainDetailSheet } from './TrainDetailSheet';
import { LoadingSkeleton } from './LoadingSkeleton';
import { InlineError } from './InlineError';
import { useAppStore } from '@/store/appStore';
import type { TrainDeparture } from '@/types';

export function RouteDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const routeCards = useAppStore((s) => s.routeCards);
  const liveTrains = useAppStore((s) => s.liveTrains);
  const liveTrainsLoading = useAppStore((s) => s.liveTrainsLoading);
  const liveTrainsError = useAppStore((s) => s.liveTrainsError);
  const fetchLiveTrains = useAppStore((s) => s.fetchLiveTrains);
  const setPendingAlertPrefill = useAppStore((s) => s.setPendingAlertPrefill);

  const card = routeCards.find((c) => c.id === id);
  const trains = id ? liveTrains[id] ?? [] : [];
  const isLoading = id ? liveTrainsLoading[id] ?? false : false;
  const error = id ? liveTrainsError[id] ?? null : null;
  const [routeFilter, setRouteFilter] = useState<string>('train');
  const [selectedTrain, setSelectedTrain] = useState<TrainDeparture | null>(null);
  const [visibleCount, setVisibleCount] = useState(5);

  const filteredTrains = routeFilter === 'all'
    ? trains
    : trains.filter(t => (t.transportType || getTransportMode(t.route)) === routeFilter);

  // Show visibleCount results
  const displayTrains = filteredTrains.slice(0, visibleCount);
  const hasMore = filteredTrains.length > visibleCount;

  // Reset visible count when filter changes
  useEffect(() => {
    setVisibleCount(5);
  }, [routeFilter]);

  useEffect(() => {
    if (id) {
      fetchLiveTrains(id);
    }
  }, [id, fetchLiveTrains]);

  const handleBellTap = (train: TrainDeparture) => {
    if (!card) return;
    setPendingAlertPrefill({
      routeCardId: card.id,
      routeTitle: card.title,
      origin: card.origin,
      destination: card.destination,
      routeFilter: card.routeFilter,
      departureTime: train.estimatedTime || train.scheduledTime,
      tripId: train.tripId,
      platform: train.platform,
    });
    navigate('/schedule');
  };

  if (!card) {
    return (
      <div>
        <PageHeader title="Route" backButton />
        <p style={{ padding: '16px', color: 'var(--muted)' }}>Route not found</p>
      </div>
    );
  }

  return (
    <div className="route-details-page">
      <PageHeader title={card.title} backButton />
      <div className="route-details-meta">
        <span className="route-details-direction">{card.origin} → {card.destination}</span>
        <span className="route-details-live-badge">Live</span>
      </div>
      <div className="route-details-trains">
        {isLoading && <LoadingSkeleton />}
        {error && <InlineError message={error} onRetry={() => fetchLiveTrains(id!)} />}
        {!isLoading && !error && trains.length > 0 && (
          <ModeFilter trains={trains} activeFilter={routeFilter} onFilter={setRouteFilter} />
        )}
        {!isLoading && !error && trains.length === 0 && (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '24px' }}>No upcoming trains</p>
        )}
        {!isLoading && !error && displayTrains.map((train) => (
          <TrainCard
            key={train.tripId}
            train={train}
            onBellTap={() => handleBellTap(train)}
            onTap={() => setSelectedTrain(train)}
          />
        ))}
        {!isLoading && !error && hasMore && (
          <button
            className="btn-secondary load-more-btn"
            onClick={() => setVisibleCount(prev => prev + 5)}
            type="button"
          >
            Load more ({filteredTrains.length - visibleCount} remaining)
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
          onClose={() => setSelectedTrain(null)}
        />
      )}
    </div>
  );
}
