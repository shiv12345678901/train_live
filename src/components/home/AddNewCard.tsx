interface AddNewCardProps {
  onClick: () => void;
  index?: number;
}

export function AddNewCard({ onClick, index = 0 }: AddNewCardProps) {
  return (
    <button
      className="route-card add-new-card"
      onClick={onClick}
      type="button"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="add-new-icon-wrapper">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="7" x2="12" y2="17" />
          <line x1="7" y1="12" x2="17" y2="12" />
        </svg>
      </div>
      <h3 className="add-new-title">New route</h3>
      <p className="add-new-subtitle">Tap to add</p>
    </button>
  );
}
