"use client";

import React, { useMemo, useState } from "react";

// Cache missing icons across the session to avoid spamming /api/assets/icon with 404s
// when the wallet lists hundreds of long-tail tokens.
const missingIconSymbols = new Set<string>();

type Tone = "neutral" | "accent" | "up" | "warn";

function normalizeSymbol(symbol: string): string {
  return String(symbol || "")
    .trim()
    .toUpperCase();
}

function markForSymbol(symbol: string): { glyph: string; tone: Tone } {
  const s = normalizeSymbol(symbol);

  // Keep this conservative: no brand-color hardcoding.
  // We use existing semantic tokens only (accent/up/warn/etc.).
  switch (s) {
    case "BTC":
      return { glyph: "₿", tone: "warn" };
    case "ETH":
      return { glyph: "Ξ", tone: "accent" };
    case "USDT":
      return { glyph: "T", tone: "up" };
    case "USDC":
      return { glyph: "U", tone: "accent" };
    case "BNB":
      return { glyph: "B", tone: "warn" };
    case "XRP":
      return { glyph: "X", tone: "neutral" };
    case "SOL":
      return { glyph: "S", tone: "accent" };
    case "TRX":
      return { glyph: "T", tone: "warn" };
    case "ADA":
      return { glyph: "A", tone: "accent" };
    default: {
      const fallback = s ? s.slice(0, Math.min(3, s.length)) : "?";
      return { glyph: fallback, tone: "neutral" };
    }
  }
}

function classesForTone(tone: Tone): string {
  switch (tone) {
    case "accent":
      return "bg-[var(--card-2)] text-[var(--accent)]";
    case "up":
      return "bg-[var(--up-bg)] text-[var(--up)]";
    case "warn":
      return "bg-[var(--warn-bg)] text-[var(--warn)]";
    default:
      return "bg-[var(--card-2)] text-[var(--foreground)]";
  }
}

export function AssetIcon({
  symbol,
  size = 18,
  className = "",
}: {
  symbol: string;
  size?: number;
  className?: string;
}) {
  const s = useMemo(() => normalizeSymbol(symbol), [symbol]);
  const { glyph, tone } = useMemo(() => markForSymbol(s), [s]);
  const [iconFailed, setIconFailed] = useState(() => (s ? missingIconSymbols.has(s) : false));

  // Choose a text size that stays balanced as the circle grows.
  const textClass =
    size <= 16
      ? "text-[10px]"
      : size <= 20
        ? "text-[11px]"
        : size <= 28
          ? "text-[12px]"
          : "text-[13px]";

  // Serve SVGs from our local icon pack (no external network calls).
  // If a symbol isn't found, we fall back to the badge text.
  const iconUrl = useMemo(() => {
    if (!s) return null;
    if (iconFailed) return null;
    return `/api/assets/icon?symbol=${encodeURIComponent(s)}`;
  }, [s, iconFailed]);

  return (
    <span
      className={
        "inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--border)] " +
        // When the real SVG is present, keep the background neutral so the logo reads cleanly.
        (iconUrl ? "bg-[var(--card)] text-[var(--foreground)]" : classesForTone(tone)) +
        (className ? " " + className : "")
      }
      style={{ width: size, height: size }}
      aria-label={s || "asset"}
      title={s || ""}
    >
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt={s}
          width={size}
          height={size}
          className="h-full w-full rounded-full object-contain"
          loading="lazy"
          decoding="async"
          onError={() => {
            if (s) missingIconSymbols.add(s);
            setIconFailed(true);
          }}
        />
      ) : (
        <span className={"select-none font-extrabold leading-none " + textClass}>{glyph}</span>
      )}
    </span>
  );
}
