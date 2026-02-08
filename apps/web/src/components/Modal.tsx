"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Reusable Modal — supports confirm, prompt (text input), and info  */
/* ------------------------------------------------------------------ */

export type ModalVariant = "confirm" | "prompt" | "info";

export interface ModalProps {
  open: boolean;
  title: string;
  /** Body text or ReactNode shown below the title */
  description?: React.ReactNode;
  variant?: ModalVariant;
  /** Label for the primary action button (default "Confirm") */
  confirmLabel?: string;
  /** Tailwind classes for the confirm button (default accent gradient) */
  confirmClass?: string;
  /** Placeholder text for the prompt input */
  promptPlaceholder?: string;
  /** If true, the confirm button shows a loading spinner */
  loading?: boolean;
  /** Called with the input value (prompt) or "" (confirm) when submitted */
  onConfirm?: (value: string) => void;
  /** Called when the modal is dismissed without confirming */
  onCancel?: () => void;
}

export function Modal({
  open,
  title,
  description,
  variant = "confirm",
  confirmLabel = "Confirm",
  confirmClass,
  promptPlaceholder = "",
  loading = false,
  onConfirm,
  onCancel,
}: ModalProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Reset input when modal opens
  useEffect(() => {
    if (open) {
      setInputValue("");
      // Auto-focus the input for prompt variant
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, loading, onCancel]);

  const handleSubmit = useCallback(() => {
    if (loading) return;
    if (variant === "prompt" && !inputValue.trim()) return;
    onConfirm?.(variant === "prompt" ? inputValue.trim() : "");
  }, [loading, variant, inputValue, onConfirm]);

  if (!open) return null;

  const defaultConfirmClass =
    "rounded-lg bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] px-4 py-2 text-xs font-semibold text-white shadow-[var(--shadow)] disabled:opacity-60";

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === backdropRef.current && !loading) onCancel?.();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="mx-4 w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg">
        {/* Title */}
        <h2 className="text-sm font-semibold text-[var(--foreground)]">{title}</h2>

        {/* Description */}
        {description ? (
          <p className="mt-2 text-xs text-[var(--muted)]">{description}</p>
        ) : null}

        {/* Prompt input */}
        {variant === "prompt" ? (
          <input
            ref={inputRef}
            type="text"
            className="mt-3 w-full rounded border border-[var(--border)] bg-transparent px-3 py-2 text-xs outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
            placeholder={promptPlaceholder}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            disabled={loading}
          />
        ) : null}

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-2">
          {variant !== "info" ? (
            <button
              type="button"
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs text-[var(--muted)] transition hover:text-[var(--foreground)] disabled:opacity-60"
              disabled={loading}
              onClick={onCancel}
            >
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            className={confirmClass ?? defaultConfirmClass}
            disabled={loading || (variant === "prompt" && !inputValue.trim())}
            onClick={handleSubmit}
          >
            {loading ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Working…
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
