import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { SettingRow } from './SettingRow';
import { useAppStore } from '@/store/appStore';

export function SettingsScreen() {
  const { settings, updateSettings } = useAppStore();
  const [botTokenInput, setBotTokenInput] = useState(settings.telegramBotToken ?? '');
  const [chatIdInput, setChatIdInput] = useState(settings.telegramChatId ?? '');

  const handleSaveTelegram = () => {
    updateSettings({
      telegramBotToken: botTokenInput,
      telegramChatId: chatIdInput,
      telegramConnected: !!(botTokenInput && chatIdInput),
    });
  };

  const handleTimezoneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateSettings({ timezone: e.target.value });
  };

  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateSettings({ theme: e.target.value as 'light' | 'dark' });
  };

  const maskToken = (token: string) => {
    if (!token) return '';
    if (token.length <= 8) return '••••••••';
    return token.slice(0, 4) + '••••' + token.slice(-4);
  };

  return (
    <div className="settings-screen">
      <PageHeader title="Settings" />

      {/* Telegram Section */}
      <section className="setting-section">
        <h2 className="setting-section-title">Telegram</h2>
        <SettingRow
          label="Bot Token"
          status={settings.telegramConnected ? 'connected' : 'disconnected'}
        >
          <input
            type="password"
            className="setting-input"
            placeholder="Enter bot token"
            value={botTokenInput}
            onChange={(e) => setBotTokenInput(e.target.value)}
          />
          {settings.telegramBotToken && (
            <span className="setting-row-masked">{maskToken(settings.telegramBotToken)}</span>
          )}
        </SettingRow>
        <SettingRow label="Chat ID">
          <input
            type="text"
            className="setting-input"
            placeholder="Enter chat ID"
            value={chatIdInput}
            onChange={(e) => setChatIdInput(e.target.value)}
          />
        </SettingRow>
        <button className="btn-primary setting-save-btn" onClick={handleSaveTelegram}>
          Save Telegram Settings
        </button>
      </section>

      {/* API Section */}
      <section className="setting-section">
        <h2 className="setting-section-title">API</h2>
        <SettingRow
          label="API Key"
          value={settings.apiKey ? 'Configured' : 'Not configured'}
          status={settings.apiKey ? 'connected' : 'disconnected'}
        />
      </section>

      {/* Timezone Section */}
      <section className="setting-section">
        <h2 className="setting-section-title">Timezone</h2>
        <SettingRow label="Timezone">
          <select
            className="setting-select"
            value={settings.timezone}
            onChange={handleTimezoneChange}
          >
            <option value={Intl.DateTimeFormat().resolvedOptions().timeZone}>
              {Intl.DateTimeFormat().resolvedOptions().timeZone} (auto-detected)
            </option>
            <option value="Australia/Sydney">Australia/Sydney</option>
            <option value="Australia/Melbourne">Australia/Melbourne</option>
            <option value="Australia/Brisbane">Australia/Brisbane</option>
            <option value="Australia/Perth">Australia/Perth</option>
            <option value="UTC">UTC</option>
          </select>
        </SettingRow>
      </section>

      {/* Delivery Status Section */}
      <section className="setting-section">
        <h2 className="setting-section-title">Delivery Status</h2>
        <SettingRow label="Last Send" value="—" />
        <SettingRow label="Error Count" value="0" />
      </section>

      {/* Theme Section */}
      <section className="setting-section">
        <h2 className="setting-section-title">Theme</h2>
        <SettingRow label="Appearance">
          <select
            className="setting-select"
            value={settings.theme}
            onChange={handleThemeChange}
          >
            <option value="light">Light</option>
            <option value="dark">Dark (coming soon)</option>
          </select>
        </SettingRow>
      </section>

      {/* About Section */}
      <section className="setting-section">
        <h2 className="setting-section-title">About</h2>
        <SettingRow label="App Version" value="1.0.0" />
        <SettingRow label="Build" value="2024.1" />
      </section>
    </div>
  );
}
