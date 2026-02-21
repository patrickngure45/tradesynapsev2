import type { ReactNode } from "react";

export function ModuleCard(props: {
  title: string;
  accent?: "accent" | "accent-2";
  right?: ReactNode;
  children: ReactNode;
  subtitle?: ReactNode;
}) {
  const accentVar = props.accent === "accent-2" ? "var(--accent-2)" : "var(--accent)";

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% 18%, var(--ring) 0, transparent 55%), radial-gradient(circle at 82% 72%, var(--ring) 0, transparent 55%)",
        }}
      />

      <div className="relative p-5 md:p-6">
        <div className="flex items-center gap-3">
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            <span className="absolute inline-flex h-2.5 w-2.5 rounded-full" style={{ background: accentVar }} />
            <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
          </span>
          <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">{props.title}</div>
          <div className="h-px flex-1 bg-[var(--border)]" />
          {props.right}
        </div>

        {props.subtitle ? <div className="mt-3 text-xs text-[var(--muted)]">{props.subtitle}</div> : null}
        <div className={props.subtitle ? "mt-4" : "mt-4"}>{props.children}</div>
      </div>
    </section>
  );
}
