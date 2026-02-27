import * as React from "react";

export type V2InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "className"> & {
  className?: string;
};

export const V2Input = React.forwardRef<HTMLInputElement, V2InputProps>(function V2Input(
  { className = "", type = "text", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={
        "h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[14px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)] outline-none placeholder:text-[color-mix(in_srgb,var(--v2-muted)_70%,transparent)] focus:ring-2 focus:ring-[var(--v2-ring)] " +
        className
      }
      {...props}
    />
  );
});
