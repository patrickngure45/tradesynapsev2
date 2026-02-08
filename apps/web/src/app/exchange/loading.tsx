export default function ExchangeLoading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-4 px-4 py-6">
      {/* Top bar skeleton */}
      <div className="flex items-center gap-4">
        <div className="h-8 w-40 rounded-lg bg-[var(--border)]" />
        <div className="h-8 w-24 rounded-lg bg-[var(--border)]" />
        <div className="ml-auto h-8 w-32 rounded-lg bg-[var(--border)]" />
      </div>

      {/* Main grid skeleton */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {/* Chart area */}
        <div className="col-span-1 lg:col-span-3">
          <div className="h-[400px] rounded-2xl bg-[var(--card)] border border-[var(--border)]" />
        </div>

        {/* Order form + book sidebar */}
        <div className="space-y-4">
          <div className="h-48 rounded-2xl bg-[var(--card)] border border-[var(--border)]" />
          <div className="h-64 rounded-2xl bg-[var(--card)] border border-[var(--border)]" />
        </div>
      </div>

      {/* Bottom panels */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="h-40 rounded-2xl bg-[var(--card)] border border-[var(--border)]" />
        <div className="h-40 rounded-2xl bg-[var(--card)] border border-[var(--border)]" />
        <div className="h-40 rounded-2xl bg-[var(--card)] border border-[var(--border)]" />
      </div>
    </div>
  );
}
