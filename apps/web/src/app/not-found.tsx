import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 font-sans text-[var(--foreground)]">
      <div className="flex items-center gap-4">
        <span className="text-4xl font-bold tracking-tight text-[var(--accent)]">404</span>
        <span className="h-12 w-px bg-[var(--border)]" />
        <span className="text-sm text-[var(--muted)]">Page not found</span>
      </div>
      <p className="mt-2 max-w-xs text-center text-xs text-[var(--muted)]">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-4 flex gap-3">
        <Link
          href="/exchange"
          className="rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-medium text-white transition hover:brightness-110"
        >
          Go to Trading
        </Link>
        <Link
          href="/markets"
          className="rounded-lg border border-[var(--border)] px-5 py-2 text-xs font-medium transition hover:bg-[color-mix(in_srgb,var(--card)_70%,transparent)]"
        >
          Browse Markets
        </Link>
      </div>
    </div>
  );
}
