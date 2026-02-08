/**
 * Storage backend abstraction for evidence blobs.
 *
 * Two implementations:
 *   1. `local`  — writes to disk under EVIDENCE_DIR (default: .data/evidence)
 *   2. `s3`     — writes to an S3-compatible bucket (AWS S3, MinIO, R2, etc.)
 *
 * The active backend is selected by the `EVIDENCE_STORAGE` env var:
 *   - "local" or unset → local disk
 *   - "s3"             → S3-compatible
 *
 * Every backend exposes the same interface so upload + proof-pack routes
 * don't need to know which backend is active.
 */

export type StorageBackend = {
  /** Write a blob and return a storage URI that can be persisted in the DB. */
  put(ref: BlobRef, data: Buffer): Promise<string>;
  /** Read a blob by its storage URI. Returns `null` if not found. */
  get(storageUri: string): Promise<Buffer | null>;
  /** Delete a blob (best-effort; returns true if deleted or already absent). */
  delete(storageUri: string): Promise<boolean>;
  /** Human-readable backend name for metadata/logs. */
  readonly name: string;
};

export type BlobRef = {
  tradeId: string;
  sha256: string;
  filename: string;
};

// ── Re-export the singleton getter ────────────────────────────────────

import { getLocalBackend } from "./storage-local";
import { getS3Backend } from "./storage-s3";

let _backend: StorageBackend | null = null;

/**
 * Return the configured storage backend (singleton).
 * Reads `EVIDENCE_STORAGE` env var on first call.
 */
export function getStorageBackend(): StorageBackend {
  if (_backend) return _backend;

  const choice = (process.env.EVIDENCE_STORAGE ?? "local").toLowerCase();

  switch (choice) {
    case "s3":
      _backend = getS3Backend();
      break;
    case "local":
    default:
      _backend = getLocalBackend();
      break;
  }

  return _backend;
}
