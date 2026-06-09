interface SettingRowProps {
  label: string;
  value?: string;
  status?: 'connected' | 'disconnected' | 'none';
  onClick?: () => void;
  children?: React.ReactNode;
}

export function SettingRow({ label, value, status, onClick, children }: SettingRowProps) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onClick();
  };

  return (
    <div
      className={`setting-row ${onClick ? 'setting-row--button' : ''}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="setting-row-header">
        <span className="setting-row-label">{label}</span>
        {status && status !== 'none' && (
          <span className={`setting-row-status ${status}`}>{status}</span>
        )}
        {onClick && (
          <svg className="setting-row-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        )}
      </div>
      {value && <span className="setting-row-value">{value}</span>}
      {children}
    </div>
  );
}
