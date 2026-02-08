import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "pp_session";

type SessionPayload = {
  uid: string;
  iat: number;
  exp: number;
};

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(text: string): Buffer {
  const pad = text.length % 4;
  const padded = text + (pad ? "=".repeat(4 - pad) : "");
  const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

function sign(secret: string, payloadB64: string): string {
  const mac = createHmac("sha256", secret).update(payloadB64, "utf8").digest();
  return base64UrlEncode(mac);
}

export function getSessionCookieName(): string {
  return COOKIE_NAME;
}

export function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  const parts = header.split(/;\s*/g);
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}

export function getSessionTokenFromRequest(request: Request): string | null {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  return cookies[COOKIE_NAME] ?? null;
}

export function createSessionToken(opts: {
  userId: string;
  secret: string;
  ttlSeconds?: number;
  now?: number;
}): string {
  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
  const ttl = typeof opts.ttlSeconds === "number" ? opts.ttlSeconds : 60 * 60 * 24 * 7;
  const payload: SessionPayload = {
    uid: opts.userId,
    iat: nowSec,
    exp: nowSec + ttl,
  };

  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sigB64 = sign(opts.secret, payloadB64);
  return `${payloadB64}.${sigB64}`;
}

export function verifySessionToken(opts: {
  token: string;
  secret: string;
  now?: number;
}): { ok: true; payload: SessionPayload } | { ok: false; error: string } {
  const token = opts.token.trim();
  const dot = token.indexOf(".");
  if (dot <= 0) return { ok: false, error: "session_token_invalid" };

  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  if (!payloadB64 || !sigB64) return { ok: false, error: "session_token_invalid" };

  const expectedSig = sign(opts.secret, payloadB64);
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "session_token_invalid" };
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8")) as SessionPayload;
  } catch {
    return { ok: false, error: "session_token_invalid" };
  }

  if (!payload || typeof payload !== "object") return { ok: false, error: "session_token_invalid" };
  if (typeof payload.uid !== "string" || !payload.uid) return { ok: false, error: "session_token_invalid" };
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
    return { ok: false, error: "session_token_invalid" };
  }

  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
  if (payload.exp <= nowSec) return { ok: false, error: "session_token_expired" };

  return { ok: true, payload };
}

export function serializeSessionCookie(opts: {
  token: string;
  maxAgeSeconds: number;
  secure: boolean;
}): string {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(opts.token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(opts.maxAgeSeconds))}`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

export function serializeClearSessionCookie(opts?: { secure?: boolean }): string {
  const parts = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (opts?.secure) parts.push("Secure");
  return parts.join("; ");
}
