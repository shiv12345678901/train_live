interface SettingRowProps {
  label: string;
  value?: string;
  status?: 'connected' | 'disconnected' | 'none';
  children?: React.ReactNode;
}

export function SettingRow({ label, value, status, children }: SettingRowProps) {
  return (
    <div className="setting-row">
      <div className="setting-row-header">
        <span className="setting-row-label">{label}</span>
        {status && status !== 'none' && (
          <span className={`setting-row-status ${status}`}>{status}</span>
        )}
      </div>
      {value && <span className="setting-row-value">{value}</span>}
      {children}
    </div>
  );
}
