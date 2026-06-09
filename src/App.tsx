import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { HomeScreen } from '@/components/home/HomeScreen';
import { RouteDetailsPage } from '@/components/route-details/RouteDetailsPage';
import { ScheduleScreen } from '@/components/schedule/ScheduleScreen';
import { SettingsScreen } from '@/components/settings/SettingsScreen';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomeScreen />} />
          <Route path="/route/:id" element={<RouteDetailsPage />} />
          <Route path="/schedule" element={<ScheduleScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
