/**
 * TOTP (RFC 6238) implementation using Node.js built-in crypto.
 *
 * Zero external dependencies — uses HMAC-SHA1 per the RFC spec.
 * Compatible with Google Authenticator, Authy, 1Password, etc.
 */

import { createHmac, randomBytes } from "node:crypto";

// ─── Base32 (RFC 4648) ──────────────────────────────────────────────

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";

  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_CHARS[(value << (5 - bits)) & 31];
  }
  return out;
}

export function base32Decode(str: string): Buffer {
  const cleaned = str.replace(/[=\s]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const ch of cleaned) {
    const idx = BASE32_CHARS.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid base32 character: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// ─── TOTP Core ──────────────────────────────────────────────────────

const TOTP_PERIOD = 30; // seconds
const TOTP_DIGITS = 6;
const TOTP_DRIFT = 1; // ±1 step window (covers 90 seconds)

/**
 * Generate a HOTP code for a given counter.
 */
function hotp(secret: Buffer, counter: bigint): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(counter);

  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/**
 * Generate a TOTP code for the current (or given) time.
 */
export function generateTOTP(secretBase32: string, nowMs?: number): string {
  const secret = base32Decode(secretBase32);
  const now = Math.floor((nowMs ?? Date.now()) / 1000);
  const counter = BigInt(Math.floor(now / TOTP_PERIOD));
  return hotp(secret, counter);
}

/**
 * Verify a TOTP code with ±1 step drift tolerance.
 * Returns true if the code matches any step in the window.
 */
export function verifyTOTP(secretBase32: string, code: string, nowMs?: number): boolean {
  const secret = base32Decode(secretBase32);
  const now = Math.floor((nowMs ?? Date.now()) / 1000);
  const currentCounter = Math.floor(now / TOTP_PERIOD);

  for (let i = -TOTP_DRIFT; i <= TOTP_DRIFT; i++) {
    const counter = BigInt(currentCounter + i);
    if (hotp(secret, counter) === code.trim()) return true;
  }
  return false;
}

// ─── Key Generation ─────────────────────────────────────────────────

/**
 * Generate a random 20-byte (160-bit) TOTP secret, returned as base32.
 */
export function generateTOTPSecret(): string {
  return base32Encode(randomBytes(20));
}

/**
 * Build the otpauth:// URI for QR code scanning.
 * Compatible with Google Authenticator, Authy, 1Password, etc.
 */
export function buildTOTPUri(opts: {
  secret: string;
  email: string;
  issuer?: string;
}): string {
  const issuer = opts.issuer ?? "TradeSynapse";
  const label = `${issuer}:${opts.email}`;
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

// ─── Backup Codes ───────────────────────────────────────────────────

/**
 * Generate 8 random 8-character alphanumeric backup codes.
 */
export function generateBackupCodes(count = 8): string[] {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8);
    let code = "";
    for (const b of bytes) {
      code += chars[b % chars.length];
    }
    // Format as XXXX-XXXX for readability
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}
