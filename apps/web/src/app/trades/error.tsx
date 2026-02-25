"use client";

/**
 * Reusable route-level error boundary.
 * Drop this into any route as `error.tsx`.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-xl text-red-400">
        !
      </div>
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="max-w-md text-sm text-[var(--v2-muted)]">
        An unexpected error occurred. Please try again.
        {error.digest && (
          <span className="mt-2 block font-mono text-xs">ID: {error.digest}</span>
        )}
      </p>
      <button
        onClick={() => reset()}
        className="rounded-lg bg-[var(--v2-accent)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
      >
        Try Again
      </button>
    </div>
  );
}
