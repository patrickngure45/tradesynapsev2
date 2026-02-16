"use client";

export default function AdminError({
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
      <h2 className="text-lg font-semibold">Admin Error</h2>
      <p className="max-w-md text-sm text-[var(--muted)]">
        The admin dashboard encountered an error.
        {error.message ? (
          <span className="mt-2 block font-mono text-xs">{error.message}</span>
        ) : null}
        {error.digest && (
          <span className="mt-2 block font-mono text-xs">ID: {error.digest}</span>
        )}
      </p>
      <button
        onClick={() => reset()}
        className="rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent)]/80"
      >
        Reload
      </button>
    </div>
  );
}
