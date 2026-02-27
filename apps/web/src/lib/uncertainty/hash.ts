import crypto from "crypto";

export function sha256Hex(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function randomSeedB64(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString("base64");
}

export function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(String(value ?? "").trim());
}

export function bytesToU64BigInt(buf: Buffer): bigint {
  if (buf.length < 8) throw new Error("buffer_too_small");
  let out = 0n;
  for (let i = 0; i < 8; i++) {
    out = (out << 8n) | BigInt(buf[i]!);
  }
  return out;
}
