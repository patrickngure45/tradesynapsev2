import type { CSSProperties } from "react";

export function LogoMark({
  size = 18,
  className = "",
  style,
}: {
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const s = Math.max(12, Math.min(48, Math.floor(size)));

  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden
      focusable="false"
    >
      {/* Minimal candlestick trio: reads "exchange" instantly, not "books" */}
      <line x1="7" y1="5" x2="7" y2="19" />
      <rect x="5.4" y="9" width="3.2" height="6" rx="0.9" />

      <line x1="12" y1="4" x2="12" y2="20" />
      <rect x="10.4" y="7" width="3.2" height="8" rx="0.9" />

      <line x1="17" y1="6" x2="17" y2="18" />
      <rect x="15.4" y="11" width="3.2" height="4" rx="0.9" />
    </svg>
  );
}
