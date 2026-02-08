/** Login – centered form skeleton */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-xl bg-[var(--card)] p-8">
        <div className="mx-auto h-6 w-32 animate-pulse rounded bg-[var(--border)]" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-[var(--border)]" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-[var(--border)]" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-[var(--border)]" />
      </div>
    </div>
  );
}
