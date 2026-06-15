import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const LAST_ROUTE_KEY = 'trainlive:lastRouteUrl';
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
      const savedPathname = saved.split(/[?#]/)[0];

      if (location.pathname === '/' && saved && canRestore(savedPathname)) {
        navigate(saved, { replace: true });
        return;
      }
    }

    localStorage.setItem(LAST_ROUTE_KEY, current);
  }, [location.hash, location.pathname, location.search, navigate]);

  return null;
}
