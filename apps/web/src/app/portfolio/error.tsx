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
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--down)_22%,var(--border))] bg-[color-mix(in_srgb,var(--down)_10%,transparent)] text-xl text-[var(--down)]">
        !
      </div>
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="max-w-md text-sm text-[var(--muted)]">
        An unexpected error occurred. Please try again.
        {error.digest && (
          <span className="mt-2 block font-mono text-xs">ID: {error.digest}</span>
        )}
      </p>
      <button
        onClick={() => reset()}
        className="inline-flex h-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] px-5 text-sm font-semibold text-white shadow-[var(--shadow)] transition hover:opacity-95"
      >
        Try Again
      </button>
    </div>
  );
}
