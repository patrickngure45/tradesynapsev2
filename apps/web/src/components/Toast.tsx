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
    "pointer-events-none fixed bottom-4 right-4 z-50 rounded-lg border px-3 py-2 text-sm shadow-sm";

  const klass =
    kind === "success"
      ? `${base} border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950 dark:text-emerald-100`
      : kind === "error"
        ? `${base} border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950 dark:text-rose-100`
        : `${base} border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100`;

  return (
    <div role="status" aria-live="polite" className={klass}>
      {message}
    </div>
  );
}
