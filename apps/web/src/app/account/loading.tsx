/** Account – settings form skeleton */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="h-8 w-32 animate-pulse rounded bg-[var(--border)]" />
      {/* Settings sections */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-4 rounded-xl bg-[var(--card)] p-6">
          <div className="h-5 w-36 animate-pulse rounded bg-[var(--border)]" />
          <div className="h-10 w-full animate-pulse rounded-lg bg-[var(--border)]" />
          <div className="h-10 w-full animate-pulse rounded-lg bg-[var(--border)]" />
        </div>
      ))}
    </div>
  );
}
