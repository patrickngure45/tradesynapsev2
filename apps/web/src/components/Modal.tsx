"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v2ButtonClassName } from "@/components/v2/Button";

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
    v2ButtonClassName({ variant: "primary", size: "sm" });

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
      <div className="mx-4 w-full max-w-md rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-6 shadow-[var(--v2-shadow-md)]">
        {/* Title */}
        <h2 className="text-[15px] font-semibold text-[var(--v2-text)]">{title}</h2>

        {/* Description */}
        {description ? (
          <p className="mt-2 text-[13px] text-[var(--v2-muted)]">{description}</p>
        ) : null}

        {/* Prompt input */}
        {variant === "prompt" ? (
          <input
            ref={inputRef}
            type="text"
            className="mt-3 h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[14px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)] outline-none transition placeholder:text-[color-mix(in_srgb,var(--v2-muted)_70%,transparent)] focus:ring-2 focus:ring-[var(--v2-ring)]"
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
              className={v2ButtonClassName({ variant: "secondary", size: "sm" })}
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
