"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AssetIcon } from "@/components/AssetIcon";

function norm(v: string): string {
  return String(v || "").trim().toUpperCase();
}

export function AssetSelect({
  value,
  options,
  onChangeAction,
  disabled,
  buttonClassName = "",
}: {
  value: string;
  options: string[];
  onChangeAction: (next: string) => void;
  disabled?: boolean;
  buttonClassName?: string;
}) {
  const normalizedValue = useMemo(() => norm(value), [value]);
  const normalizedOptions = useMemo(() => options.map(norm).filter(Boolean), [options]);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const selectedIndex = useMemo(() => {
    const i = normalizedOptions.findIndex((o) => o === normalizedValue);
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
    // Focus list for keyboard navigation.
    queueMicrotask(() => listRef.current?.focus());
  }, [open]);

  // Prefetch a small batch of icons so the dropdown feels instant.
  // We intentionally keep this bounded to avoid flooding the network.
  useEffect(() => {
    const top = normalizedOptions.slice(0, 16);
    const wanted = Array.from(new Set([normalizedValue, ...top].filter(Boolean)));
    if (!wanted.length) return;

    const run = () => {
      for (const s of wanted) {
        const img = new Image();
        img.src = `/api/assets/icon?symbol=${encodeURIComponent(s)}`;
      }
    };

    // Prefer idle time if available.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ric = (globalThis as any).requestIdleCallback as ((cb: () => void) => void) | undefined;
    if (ric) ric(run);
    else setTimeout(run, 30);
  }, [normalizedOptions, normalizedValue]);

  const pick = (sym: string) => {
    const next = norm(sym);
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
      pick(normalizedOptions[activeIndex]!);
      return;
    }
  };

  const selected = normalizedOptions[selectedIndex] ?? normalizedValue ?? "";

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
          <AssetIcon symbol={selected} size={22} />
          <span className="min-w-0 truncate">{selected || "—"}</span>
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
            {normalizedOptions.map((sym, idx) => {
              const isActive = idx === activeIndex;
              const isSelected = sym === selected;
              return (
                <button
                  key={sym}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => pick(sym)}
                  className={
                    "flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] " +
                    (isActive ? "bg-[var(--card-2)]" : "hover:bg-[var(--card-2)]")
                  }
                >
                  <span className="inline-flex min-w-0 flex-1 items-center gap-2">
                    <AssetIcon symbol={sym} size={22} />
                    <span className="min-w-0 truncate font-semibold text-[var(--foreground)]">{sym}</span>
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
                    <span className="shrink-0 text-xs font-semibold text-[var(--muted)]"> </span>
                  )}
                </button>
              );
            })}
            {!normalizedOptions.length && (
              <div className="px-2 py-2 text-xs text-[var(--muted)]">No assets</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
