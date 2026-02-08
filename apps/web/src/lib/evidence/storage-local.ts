/**
 * Local-disk storage backend.
 *
 * This is the default for development. Blobs are stored under:
 *   <EVIDENCE_DIR>/<tradeId>/<sha256>/<filename>
 *
 * URI scheme: `local:evidence/<tradeId>/<sha256>/<filename>`
 */

import { mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import type { BlobRef, StorageBackend } from "./storage";
import {
  buildLocalStorageUri,
  getEvidenceBaseDir,
  localEvidenceFilePath,
  parseLocalStorageUri,
} from "./local";

function refToPath(ref: BlobRef): string {
  return path.join(getEvidenceBaseDir(), ref.tradeId, ref.sha256, ref.filename);
}

export function getLocalBackend(): StorageBackend {
  return {
    name: "local",

    async put(ref: BlobRef, data: Buffer): Promise<string> {
      const filePath = refToPath(ref);
      await mkdir(path.dirname(filePath), { recursive: true });
      const { writeFile } = await import("node:fs/promises");
      await writeFile(filePath, data);
      return buildLocalStorageUri(ref);
    },

    async get(storageUri: string): Promise<Buffer | null> {
      const ref = parseLocalStorageUri(storageUri);
      if (!ref) return null;
      try {
        return await readFile(localEvidenceFilePath(ref));
      } catch (e: unknown) {
        if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "ENOENT") {
          return null;
        }
        throw e;
      }
    },

    async delete(storageUri: string): Promise<boolean> {
      const ref = parseLocalStorageUri(storageUri);
      if (!ref) return false;
      try {
        await unlink(localEvidenceFilePath(ref));
        return true;
      } catch {
        return true; // already gone
      }
    },
  };
}
