import { ImageResponse } from "next/og";

export const runtime = "edge";
const BRAND_NAME = (process.env.NEXT_PUBLIC_BRAND_NAME ?? "Coinwaka").trim() || "Coinwaka";
const BRAND_TAGLINE =
  (process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? "Wallet + P2P Settlement").trim() || "Wallet + P2P Settlement";

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
          background: "linear-gradient(135deg, #070a11 0%, #0b1220 55%, #101626 100%)",
          color: "#eaf0ff",
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
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="ember" x1="8" y1="8" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#FBBF24" />
                  <stop offset="55%" stopColor="#F97316" />
                  <stop offset="100%" stopColor="#FB923C" />
                </linearGradient>
              </defs>
              <circle cx="22" cy="22" r="16" fill="#0C101B" stroke="url(#ember)" strokeWidth="4" />
              <circle cx="22" cy="22" r="11" stroke="rgba(255,255,255,0.10)" strokeWidth="2" />
              <path
                d="M22 14.2c3.2 4.2 4.8 7.5 4.8 10.1 0 3.7-2.2 5.9-4.8 5.9s-4.8-2.2-4.8-5.9c0-2.6 1.6-5.9 4.8-10.1Z"
                fill="url(#ember)"
              />
            </svg>
          </div>
          <span style={{ fontSize: 54, fontWeight: 800, letterSpacing: "-0.02em" }}>{BRAND_NAME}</span>
        </div>
        <div style={{ fontSize: 26, color: "rgba(234,240,255,0.72)", marginBottom: 16 }}>
          {BRAND_TAGLINE}
        </div>
        <div
          style={{
            display: "flex",
            gap: "32px",
            fontSize: 18,
            color: "rgba(234,240,255,0.52)",
          }}
        >
          <span>Deposits</span>
          <span>•</span>
          <span>P2P Escrow</span>
          <span>•</span>
          <span>Withdrawals</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
