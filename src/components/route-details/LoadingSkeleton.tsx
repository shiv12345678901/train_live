interface LoadingSkeletonProps {
  count?: number;
}

export function LoadingSkeleton({ count = 5 }: LoadingSkeletonProps) {
  return (
    <div className="loading-skeleton">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton-line skeleton-line--short" />
          <div className="skeleton-line skeleton-line--medium" />
          <div className="skeleton-line skeleton-line--long" />
        </div>
      ))}
    </div>
  );
}
