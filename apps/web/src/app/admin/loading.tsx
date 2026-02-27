/** Admin dashboard – tabs + table skeleton */
export default function Loading() {
  return (
    <div className="space-y-6 p-6">
      <div className="h-8 w-48 animate-pulse rounded bg-[var(--v2-border)]" />
      {/* Tab bar */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-28 animate-pulse rounded-lg bg-[var(--v2-border)]" />
        ))}
      </div>
      {/* Table */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-lg bg-[var(--v2-surface)] p-4">
            <div className="h-4 w-20 animate-pulse rounded bg-[var(--v2-border)]" />
            <div className="h-4 w-32 animate-pulse rounded bg-[var(--v2-border)]" />
            <div className="ml-auto h-4 w-16 animate-pulse rounded bg-[var(--v2-border)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
