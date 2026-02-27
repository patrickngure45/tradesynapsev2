/**
 * AES-256-GCM encryption for exchange API credentials
 *
 * Keys are encrypted with PROOFPACK_SESSION_SECRET before storage.
 * This ensures leaked DB rows don't expose user API keys.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getEncryptionKey(): Buffer {
  const secret = process.env.PROOFPACK_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("PROOFPACK_SESSION_SECRET must be at least 32 chars for credential encryption");
  }
  // Use first 32 bytes of the hex-decoded secret, or raw bytes if not hex
  const raw = Buffer.from(secret, "utf-8");
  return raw.subarray(0, 32);
}

/**
 * Encrypt a string. Returns "iv:ciphertext:tag" in hex.
 */
export function encryptCredential(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${encrypted}:${tag}`;
}

/**
 * Decrypt a previously encrypted string.
 */
export function decryptCredential(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted credential format");

  const [ivHex, ciphertextHex, tagHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
