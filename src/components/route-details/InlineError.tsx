interface InlineErrorProps {
  message: string;
  onRetry?: () => void;
}

export function InlineError({ message, onRetry }: InlineErrorProps) {
  return (
    <div className="inline-error">
      <p className="inline-error-message">{message}</p>
      {onRetry && (
        <button className="inline-error-retry" onClick={onRetry} type="button">
          Retry
        </button>
      )}
    </div>
  );
}
