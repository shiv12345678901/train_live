import { Outlet } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';

export function AppShell() {
  return (
    <div className="app-shell">
      <main className="app-main">
        <Outlet />
      </main>
      <BottomNavigation />
    </div>
  );
}
