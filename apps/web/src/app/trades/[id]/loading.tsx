/** Trade detail – skeleton */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="h-6 w-20 animate-pulse rounded bg-[var(--v2-border)]" />
      <div className="space-y-4 rounded-xl bg-[var(--v2-surface)] p-6">
        <div className="h-6 w-40 animate-pulse rounded bg-[var(--v2-border)]" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-16 animate-pulse rounded bg-[var(--v2-border)]" />
              <div className="h-5 w-24 animate-pulse rounded bg-[var(--v2-border)]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
