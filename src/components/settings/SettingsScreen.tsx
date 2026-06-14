import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { SettingRow } from './SettingRow';
import { useAppStore } from '@/store/appStore';
import { requestJson } from '@/api/client';

type Panel = 'telegram' | 'timezone' | null;
type TestState = 'idle' | 'sending' | 'sent' | 'error';

type Diagnostics = {
  ok: boolean;
  firestore: boolean;
  telegram: {
    hasSettingsToken: boolean;
    hasSettingsChatId: boolean;
    hasEnvToken: boolean;
    hasEnvChatId: boolean;
  };
  scheduler: {
    hasSecret: boolean;
    hasTfnswApiKey: boolean;
    hasCloudflareAccount: boolean;
    hasCloudflareKv: boolean;
    hasCloudflareToken: boolean;
  };
  counts: {
    routes: number;
    schedules: number;
    activeSchedules: number;
    completedSchedules: number;
  };
};

function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 8) return '********';
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusText(ok: boolean, good: string, bad: string): string {
  return ok ? good : bad;
}

export function SettingsScreen() {
  const { settings, updateSettings, routeCards, alertSchedules } = useAppStore();
  const [botTokenInput, setBotTokenInput] = useState(settings.telegramBotToken ?? '');
  const [chatIdInput, setChatIdInput] = useState(settings.telegramChatId ?? '');
  const [openPanel, setOpenPanel] = useState<Panel>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState('');
  const [testState, setTestState] = useState<TestState>('idle');

  useEffect(() => {
    let cancelled = false;
    requestJson<Diagnostics>('/settings-diagnostics')
      .then((data) => {
        if (!cancelled) setDiagnostics(data);
      })
      .catch((error) => {
        if (!cancelled) setDiagnosticsError(error instanceof Error ? error.message : 'Diagnostics unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const today = todayKey();
    const active = alertSchedules.filter((schedule) => schedule.enabled).length;
    const completed = alertSchedules.filter((schedule) => schedule.oneTimeDate && schedule.oneTimeDate < today).length;
    const activity = alertSchedules
      .flatMap((schedule) => schedule.deliveryState?.activity || [])
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt));

    return {
      routes: diagnostics?.counts.routes ?? routeCards.length,
      schedules: diagnostics?.counts.schedules ?? alertSchedules.length,
      activeSchedules: diagnostics?.counts.activeSchedules ?? active,
      completedSchedules: diagnostics?.counts.completedSchedules ?? completed,
      lastActivity: activity[0],
    };
  }, [alertSchedules, diagnostics, routeCards.length]);

  const telegramStatus = useMemo(() => {
    const hasSettings = Boolean(settings.telegramBotToken && settings.telegramChatId);
    const hasEnv = Boolean(diagnostics?.telegram.hasEnvToken && diagnostics?.telegram.hasEnvChatId);
    if (hasSettings) return { ok: true, label: 'Connected from settings', value: maskToken(settings.telegramBotToken || '') };
    if (hasEnv) return { ok: true, label: 'Connected from Netlify env', value: 'Using environment credentials' };
    if (diagnostics && !diagnostics.telegram.hasEnvToken && !settings.telegramBotToken) return { ok: false, label: 'Missing bot token', value: 'Add bot token or Netlify env token' };
    if (diagnostics && !diagnostics.telegram.hasEnvChatId && !settings.telegramChatId) return { ok: false, label: 'Missing chat ID', value: 'Add chat ID or Netlify env chat ID' };
    return { ok: false, label: 'Not connected', value: 'Add bot token and chat ID' };
  }, [diagnostics, settings.telegramBotToken, settings.telegramChatId]);

  const schedulerReady = Boolean(
    diagnostics?.scheduler.hasSecret &&
    diagnostics.scheduler.hasTfnswApiKey &&
    diagnostics.scheduler.hasCloudflareAccount &&
    diagnostics.scheduler.hasCloudflareKv &&
    diagnostics.scheduler.hasCloudflareToken
  );

  const handleSaveTelegram = () => {
    updateSettings({
      telegramBotToken: botTokenInput,
      telegramChatId: chatIdInput,
      telegramConnected: Boolean(botTokenInput && chatIdInput),
    });
    setOpenPanel(null);
  };

  const handleTimezoneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateSettings({ timezone: e.target.value });
  };

  const handleTestTelegram = async () => {
    setTestState('sending');
    try {
      await requestJson<{ success: boolean }>('/settings-telegram-test', { method: 'POST' });
      setTestState('sent');
    } catch (error) {
      console.error('Telegram settings test failed', error);
      setTestState('error');
    }
  };

  return (
    <div className="settings-screen">
      <PageHeader title="Settings" />

      <section className="setting-section">
        <div className="settings-status-grid">
          <div className="settings-status-card">
            <span>Telegram</span>
            <strong>{telegramStatus.label}</strong>
            <p>{telegramStatus.value}</p>
          </div>
          <div className="settings-status-card">
            <span>Scheduler</span>
            <strong>{schedulerReady ? 'Ready' : diagnostics ? 'Needs setup' : 'Checking'}</strong>
            <p>{diagnosticsError || 'Cloudflare, Netlify, Firestore, and TfNSW checks'}</p>
          </div>
          <div className="settings-status-card">
            <span>Activity</span>
            <strong>{stats.lastActivity ? formatDateTime(stats.lastActivity.sentAt) : 'No sends yet'}</strong>
            <p>{stats.lastActivity?.source === 'test' ? 'Last Send now test' : stats.lastActivity ? 'Last scheduler message' : 'No Telegram activity recorded'}</p>
          </div>
        </div>

        <SettingRow
          label="Telegram"
          value={telegramStatus.value}
          status={telegramStatus.ok ? 'connected' : 'disconnected'}
          onClick={() => setOpenPanel(openPanel === 'telegram' ? null : 'telegram')}
        />
        {openPanel === 'telegram' && (
          <div className="setting-detail-panel">
            <label className="setting-detail-label" htmlFor="telegram-token">Bot token</label>
            <input
              id="telegram-token"
              type="password"
              className="setting-input"
              placeholder="Enter bot token"
              value={botTokenInput}
              onChange={(e) => setBotTokenInput(e.target.value)}
            />
            <label className="setting-detail-label" htmlFor="telegram-chat">Chat ID</label>
            <input
              id="telegram-chat"
              type="text"
              className="setting-input"
              placeholder="Enter chat ID"
              value={chatIdInput}
              onChange={(e) => setChatIdInput(e.target.value)}
            />
            <div className="settings-button-row">
              <button className="btn-secondary setting-save-btn" type="button" onClick={handleTestTelegram} disabled={testState === 'sending'}>
                {testState === 'sending' ? 'Sending...' : testState === 'sent' ? 'Sent' : testState === 'error' ? 'Try test again' : 'Send test'}
              </button>
              <button className="btn-primary setting-save-btn" type="button" onClick={handleSaveTelegram}>
                Save Telegram
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="setting-section">
        <h2 className="setting-section-title">System Health</h2>
        <div className="settings-health-list">
          <div><span>Firestore</span><strong>{statusText(Boolean(diagnostics?.firestore), 'Connected', diagnosticsError || 'Checking')}</strong></div>
          <div><span>TfNSW API key</span><strong>{statusText(Boolean(diagnostics?.scheduler.hasTfnswApiKey), 'Configured', 'Missing')}</strong></div>
          <div><span>Scheduler secret</span><strong>{statusText(Boolean(diagnostics?.scheduler.hasSecret), 'Configured', 'Missing')}</strong></div>
          <div><span>Cloudflare KV</span><strong>{statusText(Boolean(diagnostics?.scheduler.hasCloudflareKv), 'Configured', 'Missing')}</strong></div>
          <div><span>Cloudflare API token</span><strong>{statusText(Boolean(diagnostics?.scheduler.hasCloudflareToken), 'Configured', 'Missing')}</strong></div>
        </div>
      </section>

      <section className="setting-section">
        <h2 className="setting-section-title">Data</h2>
        <div className="settings-metrics">
          <div><span>Routes</span><strong>{stats.routes}</strong></div>
          <div><span>Schedules</span><strong>{stats.schedules}</strong></div>
          <div><span>Active</span><strong>{stats.activeSchedules}</strong></div>
          <div><span>Completed</span><strong>{stats.completedSchedules}</strong></div>
        </div>
        <SettingRow
          label="Last Telegram activity"
          value={stats.lastActivity ? stats.lastActivity.message : 'No sent messages recorded yet'}
          status={stats.lastActivity ? 'connected' : 'none'}
        />
      </section>

      <section className="setting-section">
        <h2 className="setting-section-title">Preferences</h2>
        <SettingRow
          label="Timezone"
          value={settings.timezone}
          onClick={() => setOpenPanel(openPanel === 'timezone' ? null : 'timezone')}
        />
        {openPanel === 'timezone' && (
          <div className="setting-detail-panel">
            <select className="setting-select" value={settings.timezone} onChange={handleTimezoneChange}>
              <option value={Intl.DateTimeFormat().resolvedOptions().timeZone}>
                {Intl.DateTimeFormat().resolvedOptions().timeZone} auto
              </option>
              <option value="Australia/Sydney">Australia/Sydney</option>
              <option value="Australia/Melbourne">Australia/Melbourne</option>
              <option value="Australia/Brisbane">Australia/Brisbane</option>
              <option value="Australia/Perth">Australia/Perth</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
        )}
        <SettingRow label="Appearance" value="Light" status="none" />
        <SettingRow
          label="Clear cached data"
          value="Remove locally cached train times and sync queue"
          onClick={() => {
            if (window.confirm('Clear cached data? Saved routes and alerts will remain.')) {
              localStorage.removeItem('trainlive:liveTrainsCache');
              localStorage.removeItem('trainlive:liveTrainsCacheTime');
              localStorage.removeItem('trainlive:pendingOps');
              localStorage.removeItem('trainlive:lastSync');
              window.location.reload();
            }
          }}
        />
      </section>
    </div>
  );
}
