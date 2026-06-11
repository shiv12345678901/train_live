import { useRef, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import { ToastContainer } from '@/components/shared/Toast';

export function AppShell() {
  const location = useLocation();
  const [transitionClass, setTransitionClass] = useState('page-enter');
  const prevPathRef = useRef(location.pathname);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (prevPathRef.current !== location.pathname) {
      setTransitionClass('page-exit');
      const timer = setTimeout(() => {
        setTransitionClass('page-enter');
        prevPathRef.current = location.pathname;
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [location.pathname]);

  // Enhanced header blur on scroll (feature 21)
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    const handleScroll = () => {
      const scrolled = main.scrollTop > 10;
      main.classList.toggle('is-scrolled', scrolled);
    };

    main.addEventListener('scroll', handleScroll, { passive: true });
    return () => main.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="app-shell">
      <main className="app-main" ref={mainRef}>
        <div className={`page-transition ${transitionClass}`} key={location.pathname}>
          <Outlet />
        </div>
      </main>
      <BottomNavigation />
      <ToastContainer />
    </div>
  );
}
