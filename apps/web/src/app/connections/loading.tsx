/** Connections – cards skeleton */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="h-8 w-56 animate-pulse rounded bg-[var(--v2-border)]" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl bg-[var(--v2-surface)] p-5">
            <div className="h-5 w-32 animate-pulse rounded bg-[var(--v2-border)]" />
            <div className="h-4 w-48 animate-pulse rounded bg-[var(--v2-border)]" />
            <div className="h-9 w-full animate-pulse rounded-lg bg-[var(--v2-border)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
