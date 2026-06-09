import { useNavigate } from 'react-router-dom';

interface PageHeaderProps {
  title: string;
  backButton?: boolean;
  onBack?: () => void;
}

export function PageHeader({ title, backButton, onBack }: PageHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <header className="page-header">
      {backButton && (
        <button className="page-header-back" onClick={handleBack} aria-label="Go back">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}
      <h1 className="page-header-title">{title}</h1>
    </header>
  );
}
