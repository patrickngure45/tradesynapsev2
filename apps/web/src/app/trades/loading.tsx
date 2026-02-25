/** Trades – table skeleton */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="h-8 w-36 animate-pulse rounded bg-[var(--v2-border)]" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-lg bg-[var(--v2-surface)] p-4">
            <div className="h-4 w-20 animate-pulse rounded bg-[var(--v2-border)]" />
            <div className="h-4 w-24 animate-pulse rounded bg-[var(--v2-border)]" />
            <div className="h-4 w-16 animate-pulse rounded bg-[var(--v2-border)]" />
            <div className="ml-auto h-6 w-20 animate-pulse rounded-full bg-[var(--v2-border)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
