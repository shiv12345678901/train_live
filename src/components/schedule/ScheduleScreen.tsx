import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { AlertList } from './AlertList';
import type { ScheduleFilter } from './AlertList';
import { AlertForm } from './AlertForm';
import { AlertSummary } from './AlertSummary';
import { useAppStore } from '@/store/appStore';
import { toast } from '@/components/shared/toastStore';
import { hapticSuccess } from '@/lib/haptics';
import type { AlertFormData } from './AlertForm';

export function ScheduleScreen() {
  const {
    alertSchedules,
    routeCards,
    loadAlertSchedules,
    loadRouteCards,
    saveAlertSchedule,
    updateAlertSchedule,
    pendingAlertPrefill,
    setPendingAlertPrefill,
  } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [expandedScheduleId, setExpandedScheduleId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ScheduleFilter>('active');
  const editingSchedule = editingScheduleId ? alertSchedules.find((schedule) => schedule.id === editingScheduleId) || null : null;
  const isFormOpen = showForm || Boolean(pendingAlertPrefill) || Boolean(editingSchedule);

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

    const payload = {
      routeCardId: formData.routeCardId || pendingAlertPrefill?.routeCardId || '',
      title: formData.title,
      departureTime: formData.departureTime,
      days: formData.days,
      oneTimeDate: formData.oneTimeDate,
      enabled: editingSchedule?.enabled ?? true,
      fixedReminderMinutes: [25, 20, 10, 5],
      changeCheckMinutes: [],
      selectedTripId: formData.tripId,
      selectedPlatform: formData.platform,
      targetRoute: formData.targetRoute,
      targetDestination: formData.targetDestination,
      timezone: 'Australia/Sydney',
      delayRecheckMinutes: 2,
      fallbackWindowMinutes: 5,
      notifyOnCancellationImmediately: true,
    };

    if (editingSchedule) {
      await updateAlertSchedule(editingSchedule.id, payload);
      setExpandedScheduleId(editingSchedule.id);
      toast('Schedule updated', 'success');
    } else {
      await saveAlertSchedule(payload);
      const dayCount = formData.days.length;
      toast(
        dayCount > 1
          ? `Alert set for ${dayCount} days at ${formData.departureTime}`
          : 'Alert created',
        'success'
      );
    }

    hapticSuccess();
    setShowForm(false);
    setEditingScheduleId(null);
    setPendingAlertPrefill(null);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingScheduleId(null);
    setPendingAlertPrefill(null);
  };

  if (isFormOpen) {
    return (
      <div>
        <PageHeader title={editingSchedule ? 'Edit Alert' : 'New Alert'} backButton onBack={handleCancel} />
        {pendingAlertPrefill && <AlertSummary data={pendingAlertPrefill} />}
        <div className="schedule-content">
          <AlertForm
            prefillData={pendingAlertPrefill}
            editSchedule={editingSchedule}
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
      <div className="schedule-content">
        <div className="scheduler-health">
          <div>
            <span className="scheduler-health-label">Scheduler</span>
            <strong>Cloudflare active</strong>
          </div>
          <div>
            <span className="scheduler-health-label">Cadence</span>
            <strong>Every 1 min</strong>
          </div>
          <div>
            <span className="scheduler-health-label">Schedules</span>
            <strong>{alertSchedules.filter((schedule) => schedule.enabled).length} active</strong>
          </div>
        </div>
        <button className="btn-primary schedule-new-btn" onClick={() => setShowForm(true)}>
          New Alert
        </button>
        <div className="schedule-filter-tabs" role="tablist" aria-label="Schedule filters">
          {(['active', 'today', 'paused', 'one-time', 'recurring', 'completed'] as ScheduleFilter[]).map((item) => (
            <button
              key={item}
              className={`schedule-filter-tab ${filter === item ? 'is-active' : ''}`}
              type="button"
              onClick={() => setFilter(item)}
            >
              {item.replace('-', ' ')}
            </button>
          ))}
        </div>
        <AlertList
          schedules={alertSchedules}
          routeCards={routeCards}
          filter={filter}
          expandedId={expandedScheduleId}
          onExpand={setExpandedScheduleId}
          onEdit={(schedule) => { setEditingScheduleId(schedule.id); setShowForm(true); }}
        />
      </div>
    </div>
  );
}
