export default function WalletLoading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse space-y-6 px-4 py-8">
      <div>
        <div className="h-8 w-32 rounded-lg bg-[var(--border)]" />
        <div className="mt-2 h-4 w-56 rounded bg-[var(--border)]" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="h-44 rounded-2xl bg-[var(--card)] border border-[var(--border)]" />
        <div className="h-44 rounded-2xl bg-[var(--card)] border border-[var(--border)]" />
      </div>
      <div className="h-48 rounded-2xl bg-[var(--card)] border border-[var(--border)]" />
    </div>
  );
}
