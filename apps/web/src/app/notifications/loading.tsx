/** Notifications – list skeleton */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="h-8 w-44 animate-pulse rounded bg-[var(--border)]" />
      <div className="flex gap-2">
        <div className="h-8 w-16 animate-pulse rounded-lg bg-[var(--border)]" />
        <div className="h-8 w-24 animate-pulse rounded-lg bg-[var(--border)]" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-3 rounded-xl bg-[var(--card)] p-4">
            <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--border)]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 animate-pulse rounded bg-[var(--border)]" />
              <div className="h-3 w-64 animate-pulse rounded bg-[var(--border)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
