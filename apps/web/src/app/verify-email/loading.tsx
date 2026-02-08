/** Verify-email – centered status skeleton */
export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="space-y-3 text-center">
        <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-[var(--border)]" />
        <div className="mx-auto h-5 w-48 animate-pulse rounded bg-[var(--border)]" />
        <div className="mx-auto h-4 w-64 animate-pulse rounded bg-[var(--border)]" />
      </div>
    </div>
  );
}
