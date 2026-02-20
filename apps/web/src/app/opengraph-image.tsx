import { ImageResponse } from "next/og";

export const runtime = "edge";
const BRAND_NAME = (process.env.NEXT_PUBLIC_BRAND_NAME ?? "Coinwaka").trim() || "Coinwaka";
const BRAND_TAGLINE =
  (process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? "Spot Crypto Exchange").trim() || "Spot Crypto Exchange";

const BRAND_INITIALS = BRAND_NAME
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join("")
  .slice(0, 2) || "CW";

export const alt = `${BRAND_NAME} — ${BRAND_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0b0e14 0%, #141a24 50%, #0b0e14 100%)",
          color: "#e2e8f0",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "linear-gradient(135deg, #22d3ee, #6366f1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              fontWeight: 700,
              color: "#fff",
            }}
          >
            {BRAND_INITIALS}
          </div>
          <span style={{ fontSize: 48, fontWeight: 700 }}>{BRAND_NAME}</span>
        </div>
        <div style={{ fontSize: 24, color: "#94a3b8", marginBottom: 16 }}>
          {BRAND_TAGLINE}
        </div>
        <div
          style={{
            display: "flex",
            gap: "32px",
            fontSize: 18,
            color: "#64748b",
          }}
        >
          <span>Order Books</span>
          <span>•</span>
          <span>Arbitrage Scanner</span>
          <span>•</span>
          <span>Copy Trading</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
