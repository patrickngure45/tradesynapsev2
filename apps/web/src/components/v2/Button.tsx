import * as React from "react";

export type V2ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type V2ButtonSize = "xs" | "sm" | "md" | "lg";

export function v2ButtonClassName(options?: {
  variant?: V2ButtonVariant;
  size?: V2ButtonSize;
  fullWidth?: boolean;
  className?: string;
}): string {
  const variant: V2ButtonVariant = options?.variant ?? "secondary";
  const size: V2ButtonSize = options?.size ?? "md";

  const base =
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl transition focus:outline-none focus:ring-2 focus:ring-[var(--v2-ring)] disabled:pointer-events-none disabled:opacity-55";

  const sizeClass =
    size === "lg"
      ? "h-12 px-5 text-[15px]"
      : size === "md"
        ? "h-11 px-4 text-[14px]"
        : size === "sm"
          ? "h-9 px-3 text-[13px]"
          : "h-8 px-2.5 text-[12px]";

  const variantClass =
    variant === "primary"
      ? "bg-[var(--v2-accent)] text-white font-semibold shadow-[var(--v2-shadow-sm)] hover:brightness-105"
      : variant === "danger"
        ? "bg-[var(--v2-down)] text-white font-semibold shadow-[var(--v2-shadow-sm)] hover:brightness-105"
        : variant === "ghost"
          ? "bg-transparent text-[var(--v2-text)] font-semibold hover:bg-[var(--v2-surface-2)]"
          : "border border-[var(--v2-border)] bg-[var(--v2-surface)] text-[var(--v2-text)] font-semibold shadow-[var(--v2-shadow-sm)] hover:bg-[var(--v2-surface-2)]";

  const widthClass = options?.fullWidth ? "w-full" : "";
  const extra = options?.className ?? "";

  return [base, sizeClass, variantClass, widthClass, extra].filter(Boolean).join(" ");
}

export type V2ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: V2ButtonVariant;
  size?: V2ButtonSize;
  fullWidth?: boolean;
  className?: string;
};

export const V2Button = React.forwardRef<HTMLButtonElement, V2ButtonProps>(function V2Button(
  { variant, size, fullWidth, className, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={v2ButtonClassName({ variant, size, fullWidth, className })}
      {...props}
    />
  );
});
