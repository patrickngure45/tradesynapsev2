import type { ReactNode } from "react";

export function V2Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={
        "rounded-[var(--v2-radius-lg)] border border-[var(--v2-border)] bg-[var(--v2-surface)] shadow-[var(--v2-shadow-sm)] " +
        className
      }
    >
      {children}
    </section>
  );
}

export function V2CardHeader({
  title,
  subtitle,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3 px-4 pt-4">
      <div className="min-w-0">
        <div className="text-[15px] font-semibold text-[var(--v2-text)]">{title}</div>
        {subtitle ? <div className="mt-0.5 text-[13px] text-[var(--v2-muted)]">{subtitle}</div> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}

export function V2CardBody({ children }: { children: ReactNode }) {
  return <div className="px-4 pb-4 pt-3">{children}</div>;
}
