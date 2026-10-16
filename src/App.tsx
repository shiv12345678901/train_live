import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { HomeScreen } from '@/components/home/HomeScreen';
import { RouteDetailsPage } from '@/components/route-details/RouteDetailsPage';
import { ScheduleScreen } from '@/components/schedule/ScheduleScreen';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { ApiGuidePage } from '@/components/settings/ApiGuidePage';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { RoutePersistence } from '@/components/layout/RoutePersistence';
import { AppDataSync } from '@/components/layout/AppDataSync';

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <RoutePersistence />
        <AppDataSync />
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomeScreen />} />
            <Route path="/route/:id" element={<RouteDetailsPage />} />
            <Route path="/schedule" element={<ScheduleScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/settings/api-guide" element={<ApiGuidePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
