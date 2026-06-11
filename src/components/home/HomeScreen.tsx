import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RouteCardGrid } from './RouteCardGrid';
import { RouteCreationSheet } from './RouteCreationSheet';
import { useAppStore } from '@/store/appStore';
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

  useEffect(() => {
    loadRouteCards();
  }, [loadRouteCards]);

  useEffect(() => {
    for (const card of routeCards.slice(0, 4)) {
      if (!liveTrains[card.id] && !liveTrainsLoading[card.id]) {
        void fetchLiveTrains(card.id);
      }
    }
  }, [fetchLiveTrains, liveTrains, liveTrainsLoading, routeCards]);

  const handleSave = async (data: { title: string; origin: string; destination: string; mode: TransportMode; routeFilter: string[]; originStopId?: string; destinationStopId?: string }) => {
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
    }
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
    <div className="home-screen">
      <header className="home-header">
        <h1 className="home-header-title">
          {getGreeting()} <span className="home-header-wave" aria-hidden="true">👋</span>
        </h1>
        <p className="home-header-subtitle">Your routes</p>
      </header>
      <RouteCardGrid
        cards={routeCards}
        alertSchedules={alertSchedules}
        liveTrains={liveTrains}
        onCardClick={(id) => navigate(`/route/${id}`)}
        onAddNew={() => setShowCreation(true)}
        onReorder={(cardIds) => reorderRouteCards(cardIds)}
        onEdit={(card) => setEditingCard(card)}
        onDelete={(card) => deleteRouteCard(card.id)}
      />
    </div>
  );
}
