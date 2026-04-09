export default function Skeleton({ className = '', rounded = 'md' }) {
  return (
    <div
      className={`bg-surface-100 animate-skeleton rounded-${rounded} ${className}`}
    />
  );
}

/* Common skeleton patterns */
export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="bg-surface-0 rounded-lg shadow-sm p-5 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }) {
  return (
    <div className="border border-surface-200 rounded-lg overflow-hidden">
      <div className="bg-surface-50 px-3 py-3 flex gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="px-3 py-3 border-t border-surface-100 flex gap-4">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonMetric() {
  return (
    <div className="bg-surface-0 rounded-lg shadow-sm p-5">
      <Skeleton className="h-3 w-20 mb-2" />
      <Skeleton className="h-7 w-28" />
    </div>
  );
}
