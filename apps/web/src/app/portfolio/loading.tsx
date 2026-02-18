export default function PortfolioLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-6 px-6 py-12">
      <div>
        <div className="h-3 w-28 rounded bg-[var(--border)]" />
        <div className="mt-4 h-9 w-44 rounded-xl bg-[var(--border)]" />
        <div className="mt-2 h-4 w-96 rounded bg-[var(--border)]" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-3xl border border-[var(--border)] bg-[var(--card)]" />
        ))}
      </div>

      <div className="h-[520px] rounded-3xl border border-[var(--border)] bg-[var(--card)]" />
    </div>
  );
}
