/** Copy-trading – cards skeleton */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="h-8 w-44 animate-pulse rounded bg-[var(--border)]" />
      {/* Leader cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl bg-[var(--card)] p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--border)]" />
              <div className="h-5 w-28 animate-pulse rounded bg-[var(--border)]" />
            </div>
            <div className="flex gap-4">
              <div className="h-4 w-16 animate-pulse rounded bg-[var(--border)]" />
              <div className="h-4 w-16 animate-pulse rounded bg-[var(--border)]" />
            </div>
            <div className="h-9 w-full animate-pulse rounded-lg bg-[var(--border)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
