"use client";

export default function ExchangeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-2xl text-red-400">
        !
      </div>
      <h2 className="text-lg font-semibold">Trading Error</h2>
      <p className="max-w-md text-sm text-[var(--muted)]">
        The exchange encountered an error. Your orders and balances are safe.
        {error.digest && (
          <span className="mt-2 block font-mono text-xs">ID: {error.digest}</span>
        )}
      </p>
      <button
        onClick={() => reset()}
        className="rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent)]/80"
      >
        Reload Exchange
      </button>
    </div>
  );
}
