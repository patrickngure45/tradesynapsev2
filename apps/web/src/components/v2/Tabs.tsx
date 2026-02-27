"use client";

type Tab = { id: string; label: string };

export function V2Tabs({
  tabs,
  activeId,
  onChange,
}: {
  tabs: Tab[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      className="grid gap-1 rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-1 shadow-[var(--v2-shadow-sm)]"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, tabs.length)}, minmax(0, 1fr))` }}
      role="tablist"
    >
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={
              "h-10 rounded-xl text-[13px] font-semibold transition " +
              (active
                ? "bg-[var(--v2-surface-2)] text-[var(--v2-text)]"
                : "text-[var(--v2-muted)] hover:bg-[var(--v2-surface-2)]/70")
            }
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
