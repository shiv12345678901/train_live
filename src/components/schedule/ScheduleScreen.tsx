import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { AlertList } from './AlertList';
import { AlertForm } from './AlertForm';
import { AlertSummary } from './AlertSummary';
import { useAppStore } from '@/store/appStore';
import type { AlertFormData } from './AlertForm';

export function ScheduleScreen() {
  const {
    alertSchedules,
    routeCards,
    loadAlertSchedules,
    loadRouteCards,
    saveAlertSchedule,
    pendingAlertPrefill,
    setPendingAlertPrefill,
    settings,
  } = useAppStore();
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadAlertSchedules();
    loadRouteCards();
  }, [loadAlertSchedules, loadRouteCards]);

  useEffect(() => {
    if (pendingAlertPrefill) {
      setShowForm(true);
    }
  }, [pendingAlertPrefill]);

  const handleSave = async (formData: AlertFormData) => {
    await saveAlertSchedule({
      routeCardId: formData.routeCardId || pendingAlertPrefill?.routeCardId || '',
      title: formData.title,
      departureTime: formData.departureTime,
      days: formData.days,
      oneTimeDate: formData.oneTimeDate,
      enabled: true,
      fixedReminderMinutes: [20, 15, 10, 5],
      changeCheckMinutes: [18, 13],
      selectedTripId: formData.tripId,
      selectedPlatform: formData.platform,
    });
    setShowForm(false);
    setPendingAlertPrefill(null);
  };

  const handleCancel = () => {
    setShowForm(false);
    setPendingAlertPrefill(null);
  };

  if (showForm) {
    return (
      <div>
        <PageHeader title="New Alert" backButton onBack={handleCancel} />
        {pendingAlertPrefill && <AlertSummary data={pendingAlertPrefill} />}
        <div style={{ padding: '0 16px' }}>
          <AlertForm
            prefillData={pendingAlertPrefill}
            routeCards={routeCards}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Schedule" />
      <div style={{ padding: '0 16px' }}>
        <button className="btn-primary" onClick={() => setShowForm(true)} style={{ marginBottom: '16px', width: '100%' }}>
          New Alert
        </button>
        <AlertList schedules={alertSchedules} telegramConfigured={settings.telegramConnected} />
      </div>
    </div>
  );
}
