/** Markets – table skeleton */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="h-8 w-48 animate-pulse rounded bg-[var(--border)]" />
      {/* Search bar */}
      <div className="h-10 w-full max-w-sm animate-pulse rounded-lg bg-[var(--border)]" />
      {/* Table rows */}
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-lg bg-[var(--card)] p-4">
            <div className="h-5 w-24 animate-pulse rounded bg-[var(--border)]" />
            <div className="h-5 w-20 animate-pulse rounded bg-[var(--border)]" />
            <div className="ml-auto h-5 w-16 animate-pulse rounded bg-[var(--border)]" />
            <div className="h-5 w-16 animate-pulse rounded bg-[var(--border)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
