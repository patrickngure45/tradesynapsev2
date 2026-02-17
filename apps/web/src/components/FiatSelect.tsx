"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { fiatCodeToIso2 } from "@/lib/p2p/fiatIso2";

type FiatOption = { code: string; name?: string };

function norm(v: string): string {
  return String(v || "").trim().toUpperCase();
}

function Flag({ iso2, label }: { iso2: string | null; label: string }) {
  if (!iso2) {
    return <span className="inline-block h-3.5 w-5 rounded-sm border border-[var(--border)] bg-[var(--card-2)]" aria-hidden />;
  }
  return (
    <span
      className={`fi fi-${iso2} inline-block h-3.5 w-5 rounded-sm border border-[var(--border)]`}
      aria-label={label}
      title={label}
    />
  );
}

export function FiatSelect({
  value,
  options,
  onChangeAction,
  disabled,
  buttonClassName = "",
}: {
  value: string;
  options: FiatOption[];
  onChangeAction: (next: string) => void;
  disabled?: boolean;
  buttonClassName?: string;
}) {
  const normalizedValue = useMemo(() => norm(value), [value]);

  const normalizedOptions = useMemo(() => {
    return options
      .map((o) => ({ code: norm(o.code), name: o.name }))
      .filter((o) => Boolean(o.code));
  }, [options]);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const selectedIndex = useMemo(() => {
    const i = normalizedOptions.findIndex((o) => o.code === normalizedValue);
    return i >= 0 ? i : 0;
  }, [normalizedOptions, normalizedValue]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setOpen(false);
    };

    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => listRef.current?.focus());
  }, [open]);

  const pick = (code: string) => {
    const next = norm(code);
    if (!next) return;
    onChangeAction(next);
    setOpen(false);
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (!normalizedOptions.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, normalizedOptions.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(normalizedOptions.length - 1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      pick(normalizedOptions[activeIndex]!.code);
      return;
    }
  };

  const selected = normalizedOptions[selectedIndex] ?? { code: normalizedValue, name: undefined };
  const selectedIso2 = fiatCodeToIso2(selected.code);

  return (
    <div ref={rootRef} className="relative w-full min-w-0">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={
          "flex h-10 w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60 " +
          (buttonClassName ? buttonClassName : "")
        }
      >
        <span className="inline-flex min-w-0 flex-1 items-center gap-2">
          <Flag iso2={selectedIso2} label={selected.code} />
          <span className="min-w-0 truncate">{selected.code || "—"}</span>
        </span>
        <span className="shrink-0 text-[var(--muted)]" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          tabIndex={0}
          onKeyDown={onListKeyDown}
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]"
        >
          <div className="max-h-[60vh] overflow-auto p-1 md:max-h-72">
            {normalizedOptions.map((o, idx) => {
              const isActive = idx === activeIndex;
              const isSelected = o.code === selected.code;
              const iso2 = fiatCodeToIso2(o.code);
              return (
                <button
                  key={o.code}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => pick(o.code)}
                  className={
                    "flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] " +
                    (isActive ? "bg-[var(--card-2)]" : "hover:bg-[var(--card-2)]")
                  }
                >
                  <span className="inline-flex min-w-0 flex-1 items-center gap-2">
                    <Flag iso2={iso2} label={o.code} />
                    <span className="min-w-0 truncate font-semibold text-[var(--foreground)]">{o.code}</span>
                    {o.name ? <span className="min-w-0 truncate text-xs text-[var(--muted)]">{o.name}</span> : null}
                  </span>
                  {isSelected ? (
                    <span className="shrink-0 text-[var(--accent)]" aria-label="Selected">
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.4 7.46a1 1 0 0 1-1.42.005L3.29 9.57a1 1 0 1 1 1.42-1.4l3.08 3.12 6.69-6.74a1 1 0 0 1 1.414-.01Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  ) : (
                    <span className="shrink-0"> </span>
                  )}
                </button>
              );
            })}
            {!normalizedOptions.length && <div className="px-2 py-2 text-xs text-[var(--muted)]">No fiats</div>}
          </div>
        </div>
      )}
    </div>
  );
}
