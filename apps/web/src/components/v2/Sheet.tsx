"use client";

import { useEffect } from "react";

export function V2Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.documentElement.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />

      <div
        className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-xl rounded-t-[28px] border border-[var(--v2-border)] bg-[var(--v2-surface)] shadow-[var(--v2-shadow-md)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
          <div className="min-w-0">
            {title ? <div className="truncate text-[15px] font-semibold text-[var(--v2-text)]">{title}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-xl px-3 text-[13px] font-semibold text-[var(--v2-muted)] hover:bg-[var(--v2-surface-2)]"
          >
            Close
          </button>
        </div>
        <div className="max-h-[70dvh] overflow-auto px-4 pb-4 pt-2">{children}</div>
      </div>
    </div>
  );
}
