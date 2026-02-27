import path from "node:path";

export type LocalEvidenceRef = {
  tradeId: string;
  sha256: string;
  filename: string;
};

const LOCAL_PREFIX = "local:evidence/";

export function getEvidenceBaseDir(): string {
  // Default under the Next.js app folder; keep it gitignored.
  return process.env.EVIDENCE_DIR ?? path.join(process.cwd(), ".data", "evidence");
}

export function buildLocalStorageUri(ref: LocalEvidenceRef): string {
  return `${LOCAL_PREFIX}${ref.tradeId}/${ref.sha256}/${encodeURIComponent(ref.filename)}`;
}

export function parseLocalStorageUri(storageUri: string): LocalEvidenceRef | null {
  if (!storageUri.startsWith(LOCAL_PREFIX)) return null;
  const rest = storageUri.slice(LOCAL_PREFIX.length);
  const parts = rest.split("/");
  if (parts.length < 3) return null;
  const [tradeId, sha256, ...filenameParts] = parts;
  const filenameEncoded = filenameParts.join("/");
  const filename = decodeURIComponent(filenameEncoded);
  if (!tradeId || !sha256 || !filename) return null;
  return { tradeId, sha256, filename };
}

export function localEvidenceFilePath(ref: LocalEvidenceRef): string {
  return path.join(getEvidenceBaseDir(), ref.tradeId, ref.sha256, ref.filename);
}

export function sanitizeFilename(name: string): string {
  // Keep it simple + cross-platform safe.
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "file";
  return base.replace(/[<>:"|?*\u0000-\u001F]/g, "_").slice(0, 200) || "file";
}
