/** Security Center skeleton */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded bg-[var(--v2-border)]" />
        <div className="h-4 w-96 animate-pulse rounded bg-[var(--v2-border)]" />
      </div>
      
      <div className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-6">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 w-full animate-pulse rounded-lg bg-[var(--v2-border)] opacity-50" />
          ))}
        </div>
      </div>
    </div>
  );
}
