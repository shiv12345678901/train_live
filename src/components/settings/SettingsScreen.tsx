import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { SettingRow } from './SettingRow';
import { useAppStore } from '@/store/appStore';

export function SettingsScreen() {
  const { settings, updateSettings } = useAppStore();
  const [botTokenInput, setBotTokenInput] = useState(settings.telegramBotToken ?? '');
  const [chatIdInput, setChatIdInput] = useState(settings.telegramChatId ?? '');
  const [openPanel, setOpenPanel] = useState<'telegram' | 'timezone' | null>(null);

  const handleSaveTelegram = () => {
    updateSettings({
      telegramBotToken: botTokenInput,
      telegramChatId: chatIdInput,
      telegramConnected: !!(botTokenInput && chatIdInput),
    });
    setOpenPanel(null);
  };

  const handleTimezoneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateSettings({ timezone: e.target.value });
  };

  const maskToken = (token: string) => {
    if (!token) return '';
    if (token.length <= 8) return '••••••••';
    return token.slice(0, 4) + '••••' + token.slice(-4);
  };

  return (
    <div className="settings-screen">
      <PageHeader title="Settings" />

      <section className="setting-section">
        <SettingRow
          label="Telegram"
          value={settings.telegramBotToken ? maskToken(settings.telegramBotToken) : 'Add bot token and chat ID'}
          status={settings.telegramConnected ? 'connected' : 'disconnected'}
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
            <button className="btn-primary setting-save-btn" onClick={handleSaveTelegram}>
              Save Telegram
            </button>
          </div>
        )}
        <SettingRow
          label="Timezone"
          value={settings.timezone}
          onClick={() => setOpenPanel(openPanel === 'timezone' ? null : 'timezone')}
        />
        {openPanel === 'timezone' && (
          <div className="setting-detail-panel">
            <select
              className="setting-select"
              value={settings.timezone}
              onChange={handleTimezoneChange}
            >
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
        <SettingRow
          label="Appearance"
          value="Light"
          status="none"
        />
        <SettingRow
          label="Data"
          value="Stored locally and synced in background"
          status="none"
        />
      </section>
    </div>
  );
}
