export function V2Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={
        "animate-pulse rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] " + className
      }
      aria-hidden="true"
    />
  );
}
