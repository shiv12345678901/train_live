import { useState } from 'react';
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
import type { RouteCard as RouteCardType, AlertSchedule } from '@/types';

const ADD_NEW_ID = '__add_new__';

interface RouteCardGridProps {
  cards: RouteCardType[];
  alertSchedules: AlertSchedule[];
  onCardClick: (cardId: string) => void;
  onAddNew: () => void;
  onReorder: (cardIds: string[]) => void;
  onEdit?: (card: RouteCardType) => void;
  onDelete?: (card: RouteCardType) => void;
}

interface SortableRouteCardProps {
  id: string;
  card?: RouteCardType;
  alertStatus: string;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function SortableRouteCard({ id, card, alertStatus, onClick, onEdit, onDelete }: SortableRouteCardProps) {
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
        <RouteCard card={card} alertStatus={alertStatus} onClick={onClick} onEdit={onEdit} onDelete={onDelete} />
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
  onCardClick,
  onAddNew,
  onReorder,
  onEdit,
  onDelete,
}: RouteCardGridProps) {
  const [sortableIds, setSortableIds] = useState<string[]>(() => [
    ...cards.map((c) => c.id),
    ADD_NEW_ID,
  ]);

  // Sync sortableIds when cards change externally
  const cardIds = cards.map((c) => c.id);
  const currentCardIds = sortableIds.filter((id) => id !== ADD_NEW_ID);
  if (
    cardIds.length !== currentCardIds.length ||
    cardIds.some((id, i) => currentCardIds[i] !== id)
  ) {
    setSortableIds([...cardIds, ADD_NEW_ID]);
  }

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
    setSortableIds(newIds);

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
                onClick={() => onCardClick(card.id)}
                onEdit={onEdit ? () => onEdit(card) : undefined}
                onDelete={onDelete ? () => onDelete(card) : undefined}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
