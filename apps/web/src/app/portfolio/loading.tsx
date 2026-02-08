export default function PortfolioLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-6 px-4 py-8">
      <div>
        <div className="h-8 w-40 rounded-lg bg-[var(--border)]" />
        <div className="mt-2 h-4 w-64 rounded bg-[var(--border)]" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="h-28 rounded-2xl bg-[var(--card)] border border-[var(--border)]" />
        <div className="h-28 rounded-2xl bg-[var(--card)] border border-[var(--border)]" />
        <div className="h-28 rounded-2xl bg-[var(--card)] border border-[var(--border)]" />
      </div>
      <div className="h-64 rounded-2xl bg-[var(--card)] border border-[var(--border)]" />
    </div>
  );
}
