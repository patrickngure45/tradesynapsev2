"use client";

import { useEffect } from "react";

export type ToastKind = "success" | "error" | "info";

export function Toast({
  message,
  kind = "info",
  durationMs = 1500,
  onDone,
}: {
  message: string | null;
  kind?: ToastKind;
  durationMs?: number;
  onDone?: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => onDone?.(), durationMs);
    return () => window.clearTimeout(t);
  }, [message, durationMs, onDone]);

  if (!message) return null;

  const base =
    "pointer-events-none fixed bottom-4 left-4 right-4 z-50 rounded-xl border px-3 py-2 text-sm shadow-[var(--v2-shadow-md)] sm:left-auto sm:right-4 sm:w-[420px] overflow-hidden";

  const klass =
    kind === "success"
      ? `${base} border-[color-mix(in_srgb,var(--v2-up)_25%,var(--v2-border))] bg-[color-mix(in_srgb,var(--v2-up-bg)_70%,var(--v2-surface))] text-[var(--v2-text)]`
      : kind === "error"
        ? `${base} border-[color-mix(in_srgb,var(--v2-down)_25%,var(--v2-border))] bg-[color-mix(in_srgb,var(--v2-down-bg)_70%,var(--v2-surface))] text-[var(--v2-text)]`
        : `${base} border-[var(--v2-border)] bg-[var(--v2-surface)] text-[var(--v2-text)]`;

  return (
    <div role="status" aria-live="polite" className={klass}>
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(420px 140px at 10% 0%, color-mix(in oklab, var(--v2-accent) 18%, transparent) 0%, transparent 60%), radial-gradient(260px 140px at 90% 10%, color-mix(in oklab, var(--v2-accent-2) 12%, transparent) 0%, transparent 55%)",
        }}
      />
      <div className="relative flex items-start gap-2">
        <div
          className={
            "mt-0.5 h-2.5 w-2.5 rounded-full " +
            (kind === "success" ? "bg-[var(--v2-up)]" : kind === "error" ? "bg-[var(--v2-down)]" : "bg-[var(--v2-accent)]")
          }
        />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-[var(--v2-muted)]">
            {kind === "success" ? "Signal" : kind === "error" ? "Error" : "Update"}
          </div>
          <div className="mt-0.5 text-sm leading-snug text-[var(--v2-text)] break-words">
            {message}
          </div>
        </div>
      </div>
    </div>
  );
}
