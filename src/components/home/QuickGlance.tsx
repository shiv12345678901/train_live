import { useAppStore } from '@/store/appStore';
import { useCountdown, formatCountdown } from '@/hooks/useCountdown';
import { getLiveTrainsCacheAge } from '@/store/localStorage';

/**
 * Compact widget showing next train for pinned routes.
 * Designed for PWA home screen quick glance.
 */

function PinnedRouteWidget({ routeId }: { routeId: string }) {
  const routeCards = useAppStore((s) => s.routeCards);
  const liveTrains = useAppStore((s) => s.liveTrains);
  const card = routeCards.find((c) => c.id === routeId);
  const nextTrain = liveTrains[routeId]?.[0];
  const displayTime = nextTrain?.estimatedTime || nextTrain?.scheduledTime;
  const minutes = useCountdown(displayTime ?? null);
  const countdown = formatCountdown(minutes);

  if (!card) return null;

  const shortOrigin = card.origin.replace(/\s*(Station|Wharf|Light Rail)\s*/gi, '').trim();
  const shortDest = card.destination.replace(/\s*(Station|Wharf|Light Rail)\s*/gi, '').trim();

  return (
    <div className="quick-glance-item">
      <div className="quick-glance-route">
        <span className="quick-glance-title">{card.title}</span>
        <span className="quick-glance-direction">{shortOrigin} → {shortDest}</span>
      </div>
      <div className="quick-glance-time">
        {countdown ? (
          <>
            <span className="quick-glance-countdown">{countdown}</span>
            {nextTrain?.platform && <span className="quick-glance-platform">Plt {nextTrain.platform}</span>}
          </>
        ) : (
          <span className="quick-glance-no-data">—</span>
        )}
      </div>
    </div>
  );
}

export function QuickGlance() {
  const routeCards = useAppStore((s) => s.routeCards);
  const pinnedCards = routeCards.filter((c) => c.pinned);
  const displayCards = pinnedCards.length > 0 ? pinnedCards : routeCards.slice(0, 2);
  const cacheAge = getLiveTrainsCacheAge();

  if (displayCards.length === 0) return null;

  return (
    <div className="quick-glance">
      <div className="quick-glance-header">
        <span className="quick-glance-label">Next trains</span>
        {cacheAge && <span className="quick-glance-cache-age">{cacheAge}</span>}
      </div>
      {displayCards.map((card) => (
        <PinnedRouteWidget key={card.id} routeId={card.id} />
      ))}
    </div>
  );
}
