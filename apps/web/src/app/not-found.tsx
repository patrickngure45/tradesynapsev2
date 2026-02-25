import Link from "next/link";

export default function NotFound() {
  return (
    <div
      data-ui="v2"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--v2-bg)] font-sans text-[var(--v2-text)]"
    >
      <div className="flex items-center gap-4">
        <span className="text-4xl font-bold tracking-tight text-[var(--v2-accent)]">404</span>
        <span className="h-12 w-px bg-[var(--v2-border)]" />
        <span className="text-sm text-[var(--v2-muted)]">Page not found</span>
      </div>
      <p className="mt-2 max-w-xs text-center text-xs text-[var(--v2-muted)]">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-4 flex gap-3">
        <Link
          href="/v2/wallet"
          className="rounded-lg bg-[var(--v2-accent)] px-5 py-2 text-xs font-semibold text-white transition hover:brightness-110"
        >
          Open Wallet
        </Link>
        <Link
          href="/v2/p2p"
          className="rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface)] px-5 py-2 text-xs font-semibold transition hover:bg-[var(--v2-surface-2)]"
        >
          Browse P2P
        </Link>
      </div>
    </div>
  );
}
