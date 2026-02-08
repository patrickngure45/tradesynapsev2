/** Order history – table skeleton */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="h-8 w-52 animate-pulse rounded bg-[var(--border)]" />
      {/* Filters */}
      <div className="flex gap-3">
        <div className="h-9 w-28 animate-pulse rounded-lg bg-[var(--border)]" />
        <div className="h-9 w-28 animate-pulse rounded-lg bg-[var(--border)]" />
      </div>
      {/* Rows */}
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-lg bg-[var(--card)] p-4">
            <div className="h-4 w-20 animate-pulse rounded bg-[var(--border)]" />
            <div className="h-4 w-16 animate-pulse rounded bg-[var(--border)]" />
            <div className="h-4 w-16 animate-pulse rounded bg-[var(--border)]" />
            <div className="ml-auto h-4 w-20 animate-pulse rounded bg-[var(--border)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
