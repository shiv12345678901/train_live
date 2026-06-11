import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RouteCardGrid } from './RouteCardGrid';
import { RouteCreationSheet } from './RouteCreationSheet';
import { TripPlanner } from './TripPlanner';
import { useAppStore } from '@/store/appStore';
import { toast } from '@/components/shared/Toast';
import { hapticLight, hapticSuccess } from '@/lib/haptics';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import type { RouteCard as RouteCardType, TransportMode } from '@/types';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function HomeScreen() {
  const navigate = useNavigate();
  const {
    routeCards,
    alertSchedules,
    liveTrains,
    liveTrainsLoading,
    loadRouteCards,
    reorderRouteCards,
    saveRouteCard,
    updateRouteCard,
    deleteRouteCard,
    fetchLiveTrains,
  } = useAppStore();
  const [showCreation, setShowCreation] = useState(false);
  const [editingCard, setEditingCard] = useState<RouteCardType | null>(null);
  const [showTripPlanner, setShowTripPlanner] = useState(false);
  const [initialLoading, setInitialLoading] = useState(routeCards.length === 0);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    hapticLight();
    const refreshPromises = routeCards.map((card) => fetchLiveTrains(card.id));
    await Promise.allSettled(refreshPromises);
    hapticSuccess();
    toast('Refreshed', 'success', 2000);
  }, [fetchLiveTrains, routeCards]);

  const { containerRef, pullDistance, isRefreshing } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  useEffect(() => {
    loadRouteCards().finally(() => setInitialLoading(false));
  }, [loadRouteCards]);

  // Initial fetch for ALL cards — staggered to avoid rate limiting (Issue 4)
  useEffect(() => {
    let delay = 0;
    for (const card of routeCards) {
      if (!liveTrains[card.id] && !liveTrainsLoading[card.id]) {
        const cardId = card.id;
        setTimeout(() => { void fetchLiveTrains(cardId); }, delay);
        delay += 500; // 500ms between each request
      }
    }
  }, [fetchLiveTrains, liveTrains, liveTrainsLoading, routeCards]);

  // Auto-refresh all cards every 30 seconds
  useEffect(() => {
    const refreshAll = () => {
      if (document.visibilityState !== 'visible') return;
      for (const card of routeCards) {
        void fetchLiveTrains(card.id);
      }
    };

    refreshTimerRef.current = setInterval(refreshAll, 30000);
    document.addEventListener('visibilitychange', refreshAll);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      document.removeEventListener('visibilitychange', refreshAll);
    };
  }, [fetchLiveTrains, routeCards]);

  const handleSave = async (data: { title: string; origin: string; destination: string; mode: TransportMode; routeFilter: string[]; originStopId?: string; destinationStopId?: string }) => {
    // Duplicate route prevention (feature 29)
    if (!editingCard) {
      const isDuplicate = routeCards.some(
        (card) =>
          card.origin.trim().toLowerCase() === data.origin.trim().toLowerCase() &&
          card.destination.trim().toLowerCase() === data.destination.trim().toLowerCase()
      );
      if (isDuplicate) {
        toast('A route with the same origin and destination already exists', 'info', 4000);
        // Still allow creation — just warn
      }
    }

    if (editingCard) {
      await updateRouteCard(editingCard.id, {
        title: data.title,
        origin: data.origin,
        originStopId: data.originStopId,
        destination: data.destination,
        destinationStopId: data.destinationStopId,
        mode: data.mode,
        routeFilter: data.routeFilter,
      });
      setEditingCard(null);
      hapticSuccess();
      toast('Route updated', 'success');
    } else {
      await saveRouteCard({
        title: data.title,
        origin: data.origin,
        originStopId: data.originStopId,
        destination: data.destination,
        destinationStopId: data.destinationStopId,
        mode: data.mode,
        routeFilter: data.routeFilter,
        order: routeCards.length,
        enabled: true,
      });
      setShowCreation(false);
      hapticSuccess();
      toast('Route created', 'success');
    }
  };

  const handleDelete = (card: RouteCardType) => {
    deleteRouteCard(card.id);
    hapticLight();
    toast('Route deleted', 'info');
  };

  const handlePin = (card: RouteCardType) => {
    updateRouteCard(card.id, { pinned: !card.pinned });
    hapticLight();
    toast(card.pinned ? 'Unpinned' : 'Pinned to top', 'success', 2000);
  };

  if (showCreation || editingCard) {
    return (
      <div className="home-screen">
        <header className="home-header">
          <h1 className="home-header-title">
            {editingCard ? 'Edit route' : 'New route'}
          </h1>
        </header>
        <RouteCreationSheet
          editCard={editingCard ?? undefined}
          onSave={handleSave}
          onCancel={() => { setShowCreation(false); setEditingCard(null); }}
        />
      </div>
    );
  }

  return (
    <div className="home-screen" ref={containerRef}>
      {/* Pull-to-refresh indicator */}
      <div
        className={`pull-to-refresh ${isRefreshing ? 'is-refreshing' : ''}`}
        style={{ height: pullDistance > 0 ? `${pullDistance}px` : '0px' }}
      >
        <div className={`pull-spinner ${pullDistance > 60 ? 'ready' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 12a9 9 0 0 1-15.5 6.2" />
            <path d="M3 12a9 9 0 0 1 15.5-6.2" />
            <path d="M18 2v4h-4" />
            <path d="M6 22v-4h4" />
          </svg>
        </div>
      </div>

      <header className="home-header">
        <h1 className="home-header-title">
          {getGreeting()} <span className="home-header-wave" aria-hidden="true">👋</span>
        </h1>
        <p className="home-header-subtitle">Your routes</p>
        <button className="home-trip-planner-btn" onClick={() => setShowTripPlanner(true)} type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          Plan a trip
        </button>
      </header>

      {/* Trip Planner Overlay (feature 26) */}
      {showTripPlanner && (
        <TripPlanner onClose={() => setShowTripPlanner(false)} />
      )}

      {/* Skeleton loading state (feature 14) */}
      {initialLoading ? (
        <div className="home-skeleton">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="home-skeleton-card" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="skeleton-shimmer" />
            </div>
          ))}
        </div>
      ) : (
        <RouteCardGrid
          cards={routeCards}
          alertSchedules={alertSchedules}
          liveTrains={liveTrains}
          onCardClick={(id) => { hapticLight(); navigate(`/route/${id}`); }}
          onAddNew={() => { hapticLight(); setShowCreation(true); }}
          onReorder={(cardIds) => reorderRouteCards(cardIds)}
          onEdit={(card) => setEditingCard(card)}
          onDelete={handleDelete}
          onPin={handlePin}
        />
      )}
    </div>
  );
}
