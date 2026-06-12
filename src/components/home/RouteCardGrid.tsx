import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { RouteCard } from './RouteCard';
import { AddNewCard } from './AddNewCard';
import type { RouteCard as RouteCardType, AlertSchedule, TrainDeparture } from '@/types';

const ADD_NEW_ID = '__add_new__';

interface RouteCardGridProps {
  cards: RouteCardType[];
  alertSchedules: AlertSchedule[];
  liveTrains: Record<string, TrainDeparture[]>;
  onCardClick: (cardId: string) => void;
  onAddNew: () => void;
  onReorder: (cardIds: string[]) => void;
  onEdit?: (card: RouteCardType) => void;
  onDelete?: (card: RouteCardType) => void;
  onPin?: (card: RouteCardType) => void;
}

interface SortableRouteCardProps {
  id: string;
  card?: RouteCardType;
  alertStatus: string;
  nextTrain?: TrainDeparture;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onPin?: () => void;
}

function SortableRouteCard({ id, card, alertStatus, nextTrain, onClick, onEdit, onDelete, onPin }: SortableRouteCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {card ? (
        <RouteCard card={card} alertStatus={alertStatus} nextTrain={nextTrain} onClick={onClick} onEdit={onEdit} onDelete={onDelete} onPin={onPin} />
      ) : (
        <AddNewCard onClick={onClick} />
      )}
    </div>
  );
}

function getAlertStatus(cardId: string, alertSchedules: AlertSchedule[]): string {
  const hasActiveAlert = alertSchedules.some(
    (schedule) => schedule.routeCardId === cardId && schedule.enabled
  );
  return hasActiveAlert ? 'Alert set' : 'No alert';
}

export function RouteCardGrid({
  cards,
  alertSchedules,
  liveTrains,
  onCardClick,
  onAddNew,
  onReorder,
  onEdit,
  onDelete,
  onPin,
}: RouteCardGridProps) {
  // Sort pinned cards first. The most recently pinned route stays at the top,
  // then older pinned routes and normal saved routes keep their manual order.
  const sortedCards = [...cards].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;

    if (a.pinned && b.pinned) {
      const aPinnedAt = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0;
      const bPinnedAt = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0;
      if (aPinnedAt !== bPinnedAt) return bPinnedAt - aPinnedAt;
    }

    return a.order - b.order;
  });

  const sortableIds = [...sortedCards.map((c) => c.id), ADD_NEW_ID];

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 500,
        tolerance: 5,
      },
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortableIds.indexOf(String(active.id));
    const newIndex = sortableIds.indexOf(String(over.id));
    const newIds = arrayMove(sortableIds, oldIndex, newIndex);

    // Report only real card ids (excluding the add-new placeholder)
    const reorderedCardIds = newIds.filter((id) => id !== ADD_NEW_ID);
    onReorder(reorderedCardIds);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        <div className="route-card-grid">
          {sortableIds.map((id) => {
            if (id === ADD_NEW_ID) {
              return (
                <SortableRouteCard
                  key={ADD_NEW_ID}
                  id={ADD_NEW_ID}
                  alertStatus=""
                  onClick={onAddNew}
                />
              );
            }
            const card = cards.find((c) => c.id === id);
            if (!card) return null;
            return (
              <SortableRouteCard
                key={card.id}
                id={card.id}
                card={card}
                alertStatus={getAlertStatus(card.id, alertSchedules)}
                nextTrain={liveTrains[card.id]?.[0]}
                onClick={() => onCardClick(card.id)}
                onEdit={onEdit ? () => onEdit(card) : undefined}
                onDelete={onDelete ? () => onDelete(card) : undefined}
                onPin={onPin ? () => onPin(card) : undefined}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
