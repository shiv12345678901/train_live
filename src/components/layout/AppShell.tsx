import { useRef, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import { ToastContainer } from '@/components/shared/Toast';
import { OfflineBanner } from '@/components/shared/OfflineBanner';

export function AppShell() {
  const mainRef = useRef<HTMLElement>(null);

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
      <OfflineBanner />
      <main className="app-main" ref={mainRef}>
        <Outlet />
      </main>
      <BottomNavigation />
      <ToastContainer />
    </div>
  );
}
