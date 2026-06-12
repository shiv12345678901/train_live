import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { HomeScreen } from '@/components/home/HomeScreen';
import { RouteDetailsPage } from '@/components/route-details/RouteDetailsPage';
import { ScheduleScreen } from '@/components/schedule/ScheduleScreen';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { RoutePersistence } from '@/components/layout/RoutePersistence';

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <RoutePersistence />
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomeScreen />} />
            <Route path="/route/:id" element={<RouteDetailsPage />} />
            <Route path="/schedule" element={<ScheduleScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
