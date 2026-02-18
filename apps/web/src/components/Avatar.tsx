"use client";

import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import * as identicon from "@dicebear/identicon";

export function Avatar({
  seed,
  label,
  size = 36,
  className = "",
  fallbackText,
}: {
  seed: string;
  label?: string;
  size?: number;
  className?: string;
  fallbackText?: string;
}) {
  const svgDataUri = useMemo(() => {
    try {
      const svg = createAvatar(identicon, {
        seed: String(seed ?? ""),
        size,
      }).toString();

      // Encode for data URI.
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } catch {
      return null;
    }
  }, [seed, size]);

  const side = Math.max(16, Math.min(96, Math.floor(size)));

  return (
    <div
      aria-label={label}
      title={label}
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--card-2)] ${className}`}
      style={{ width: side, height: side }}
    >
      {svgDataUri ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={svgDataUri} alt="" width={side} height={side} />
      ) : (
        <span className="text-[11px] font-bold text-[var(--muted)]">
          {(fallbackText ?? "?").slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}
