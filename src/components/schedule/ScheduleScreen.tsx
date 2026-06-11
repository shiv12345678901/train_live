import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { AlertList } from './AlertList';
import { AlertForm } from './AlertForm';
import { AlertSummary } from './AlertSummary';
import { useAppStore } from '@/store/appStore';
import { toast } from '@/components/shared/Toast';
import { hapticSuccess } from '@/lib/haptics';
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
  const [showForm, setShowForm] = useState(Boolean(pendingAlertPrefill));

  useEffect(() => {
    if (pendingAlertPrefill) {
      setShowForm(true);
    }
  }, [pendingAlertPrefill]);

  useEffect(() => {
    loadAlertSchedules();
    loadRouteCards();
  }, [loadAlertSchedules, loadRouteCards]);

  // Feature 30: Schedule conflict detection
  function detectConflict(formData: AlertFormData): string | null {
    const existing = alertSchedules.find((schedule) => {
      if (!schedule.enabled) return false;
      if (schedule.routeCardId !== formData.routeCardId) return false;
      if (schedule.departureTime !== formData.departureTime) return false;
      // Check day overlap
      if (formData.days.length > 0 && schedule.days.length > 0) {
        const overlap = formData.days.some((d) => schedule.days.includes(d));
        if (overlap) return true;
      }
      // One-time date overlap
      if (formData.oneTimeDate && schedule.oneTimeDate === formData.oneTimeDate) return true;
      return false;
    });
    if (existing) {
      return `An alert for "${existing.title}" already exists at ${existing.departureTime} on overlapping days.`;
    }
    return null;
  }

  const handleSave = async (formData: AlertFormData) => {
    // Feature 30: conflict check
    const conflict = detectConflict(formData);
    if (conflict) {
      toast(conflict, 'info', 5000);
      // Still allow save — just warn
    }

    // Feature 35: batch creation — if recurring with days, create one schedule covering all days
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

    hapticSuccess();
    const dayCount = formData.days.length;
    toast(
      dayCount > 1
        ? `Alert set for ${dayCount} days at ${formData.departureTime}`
        : 'Alert created',
      'success'
    );
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
