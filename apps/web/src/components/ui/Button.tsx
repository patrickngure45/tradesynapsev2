import * as React from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "warning" | "success";
export type ButtonSize = "xs" | "sm" | "md";

export function buttonClassName(options?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}): string {
  const variant: ButtonVariant = options?.variant ?? "secondary";
  const size: ButtonSize = options?.size ?? "sm";

  const base =
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg transition focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-60";

  const sizeClass =
    size === "xs"
      ? "px-2.5 py-1.5 text-[11px]"
      : size === "md"
        ? "px-4 py-2 text-sm"
        : "px-3 py-2 text-xs";

  const variantClass =
    variant === "primary"
      ? "bg-[linear-gradient(90deg,var(--accent),var(--accent-2))] text-[var(--background)] font-extrabold hover:brightness-110"
      : variant === "ghost"
        ? "bg-transparent text-[var(--foreground)] font-semibold hover:bg-[var(--card)]/25"
        : variant === "danger"
          ? "border border-[var(--border)] bg-[var(--down-bg)] text-[var(--down)] font-bold hover:brightness-110"
          : variant === "warning"
            ? "bg-[var(--warn)] text-white font-extrabold hover:brightness-110"
            : variant === "success"
              ? "bg-[var(--up)] text-white font-extrabold hover:brightness-110"
          : "border border-[var(--border)] bg-[var(--card)]/25 text-[var(--foreground)] font-bold hover:bg-[var(--card)]";

  const widthClass = options?.fullWidth ? "w-full" : "";
  const extra = options?.className ?? "";

  return [base, sizeClass, variantClass, widthClass, extra].filter(Boolean).join(" ");
}

export type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, fullWidth, className, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={buttonClassName({ variant, size, fullWidth, className })}
      {...props}
    />
  );
});
