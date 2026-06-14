import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const LAST_ROUTE_KEY = 'trainlive:lastRouteUrl';
const LAST_ROUTE_TIME_KEY = 'trainlive:lastRouteUrlTime';
const ROUTE_TTL_MS = 30 * 60 * 1000;
const RESTORABLE_PATHS = [/^\/route\/[^/]+$/, /^\/schedule$/, /^\/settings$/];

function canRestore(pathname: string): boolean {
  return RESTORABLE_PATHS.some((pattern) => pattern.test(pathname));
}

export function RoutePersistence() {
  const location = useLocation();
  const navigate = useNavigate();
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    const current = `${location.pathname}${location.search}${location.hash}`;

    if (!hasRestoredRef.current) {
      hasRestoredRef.current = true;
      const saved = localStorage.getItem(LAST_ROUTE_KEY) || '';
      const savedAt = Number(localStorage.getItem(LAST_ROUTE_TIME_KEY) || 0);
      const savedPathname = saved.split(/[?#]/)[0];
      const isFresh = savedAt > 0 && Date.now() - savedAt <= ROUTE_TTL_MS;

      if (!isFresh) {
        localStorage.removeItem(LAST_ROUTE_KEY);
        localStorage.removeItem(LAST_ROUTE_TIME_KEY);
      }

      if (location.pathname === '/' && saved && isFresh && canRestore(savedPathname)) {
        navigate(saved, { replace: true });
        return;
      }
    }

    localStorage.setItem(LAST_ROUTE_KEY, current);
    localStorage.setItem(LAST_ROUTE_TIME_KEY, String(Date.now()));
  }, [location.hash, location.pathname, location.search, navigate]);

  return null;
}
