/**
 * S3-compatible storage backend for evidence blobs.
 *
 * Works with AWS S3, MinIO, Cloudflare R2, DigitalOcean Spaces, etc.
 *
 * Required env vars:
 *   EVIDENCE_S3_BUCKET      — bucket name (e.g. "proofpack-evidence")
 *   EVIDENCE_S3_REGION      — region (e.g. "us-east-1")
 *
 * Optional env vars:
 *   EVIDENCE_S3_ENDPOINT    — custom endpoint URL (for MinIO/R2/Spaces)
 *   EVIDENCE_S3_ACCESS_KEY  — access key ID
 *   EVIDENCE_S3_SECRET_KEY  — secret access key
 *   EVIDENCE_S3_PREFIX      — key prefix (default: "evidence/")
 *   EVIDENCE_S3_FORCE_PATH  — "true" to use path-style addressing (MinIO)
 *
 * If access key / secret are not set, falls back to the default AWS SDK
 * credential chain (IAM role, env AWS_ACCESS_KEY_ID, ~/.aws/credentials, etc.).
 *
 * URI scheme: `s3://<bucket>/<key>`
 *
 * ⚠  We use raw HTTP requests with AWS Signature V4 to avoid adding the
 *    full @aws-sdk/client-s3 dependency (~40 MB). This keeps the project
 *    lean. The signing implementation covers GET, PUT, DELETE which is all
 *    we need for blob storage.
 */

import { createHash, createHmac } from "node:crypto";
import type { BlobRef, StorageBackend } from "./storage";

// ── Configuration ─────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`S3 storage backend requires env var ${name}`);
  return v;
}

type S3Config = {
  bucket: string;
  region: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
  prefix: string;
  forcePathStyle: boolean;
};

function loadConfig(): S3Config {
  const bucket = requireEnv("EVIDENCE_S3_BUCKET");
  const region = requireEnv("EVIDENCE_S3_REGION");
  const endpoint =
    process.env.EVIDENCE_S3_ENDPOINT ??
    `https://s3.${region}.amazonaws.com`;
  const accessKey =
    process.env.EVIDENCE_S3_ACCESS_KEY ??
    process.env.AWS_ACCESS_KEY_ID ??
    "";
  const secretKey =
    process.env.EVIDENCE_S3_SECRET_KEY ??
    process.env.AWS_SECRET_ACCESS_KEY ??
    "";
  const prefix = process.env.EVIDENCE_S3_PREFIX ?? "evidence/";
  const forcePathStyle = process.env.EVIDENCE_S3_FORCE_PATH === "true";

  if (!accessKey || !secretKey) {
    throw new Error(
      "S3 storage backend requires EVIDENCE_S3_ACCESS_KEY + EVIDENCE_S3_SECRET_KEY (or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY)"
    );
  }

  return { bucket, region, endpoint, accessKey, secretKey, prefix, forcePathStyle };
}

// ── AWS Signature V4 (minimal) ────────────────────────────────────────

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function getSigningKey(secretKey: string, date: string, region: string, service: string): Buffer {
  const kDate = hmacSha256("AWS4" + secretKey, date);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

function signV4(opts: {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: Buffer | "";
  config: S3Config;
}): Record<string, string> {
  const { method, url, headers, body, config } = opts;
  const now = new Date();
  const dateStamp = now.toISOString().replace(/[-:]/g, "").slice(0, 8);
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const payloadHash = sha256(body);

  const signedHeaders: Record<string, string> = {
    ...headers,
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  const sortedKeys = Object.keys(signedHeaders).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k.toLowerCase()}:${signedHeaders[k]!.trim()}\n`).join("");
  const signedHeadersList = sortedKeys.map((k) => k.toLowerCase()).join(";");

  const canonicalUri = url.pathname;
  const canonicalQueryString = url.search ? url.search.slice(1) : "";

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeadersList,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join(
    "\n"
  );

  const signingKey = getSigningKey(config.secretKey, dateStamp, config.region, "s3");
  const signature = hmacSha256(signingKey, stringToSign).toString("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, SignedHeaders=${signedHeadersList}, Signature=${signature}`;

  return {
    ...signedHeaders,
    authorization,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

function objectKey(config: S3Config, ref: BlobRef): string {
  return `${config.prefix}${ref.tradeId}/${ref.sha256}/${encodeURIComponent(ref.filename)}`;
}

function objectUrl(config: S3Config, key: string): URL {
  if (config.forcePathStyle) {
    return new URL(`${config.endpoint}/${config.bucket}/${key}`);
  }
  // Virtual-hosted style.
  const base = config.endpoint.replace("://", `://${config.bucket}.`);
  return new URL(`${base}/${key}`);
}

function storageUri(config: S3Config, key: string): string {
  return `s3://${config.bucket}/${key}`;
}

function parseS3Uri(uri: string): { bucket: string; key: string } | null {
  if (!uri.startsWith("s3://")) return null;
  const rest = uri.slice(5);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
}

// ── Backend implementation ────────────────────────────────────────────

let _config: S3Config | null = null;

function cfg(): S3Config {
  if (!_config) _config = loadConfig();
  return _config;
}

export function getS3Backend(): StorageBackend {
  // Eagerly validate config on init so misconfig fails fast.
  const config = loadConfig();
  _config = config;

  return {
    name: "s3",

    async put(ref: BlobRef, data: Buffer): Promise<string> {
      const c = cfg();
      const key = objectKey(c, ref);
      const url = objectUrl(c, key);

      const headers = signV4({
        method: "PUT",
        url,
        headers: { "content-type": "application/octet-stream" },
        body: data,
        config: c,
      });

      const res = await fetch(url.toString(), {
        method: "PUT",
        headers,
        body: new Uint8Array(data),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`S3 PUT failed (${res.status}): ${text.slice(0, 300)}`);
      }

      return storageUri(c, key);
    },

    async get(uri: string): Promise<Buffer | null> {
      const c = cfg();
      const parsed = parseS3Uri(uri);
      if (!parsed) return null;

      const url = objectUrl(c, parsed.key);
      const headers = signV4({
        method: "GET",
        url,
        headers: {},
        body: "",
        config: c,
      });

      const res = await fetch(url.toString(), { method: "GET", headers });

      if (res.status === 404 || res.status === 403) {
        return null;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`S3 GET failed (${res.status}): ${text.slice(0, 300)}`);
      }

      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    },

    async delete(uri: string): Promise<boolean> {
      const c = cfg();
      const parsed = parseS3Uri(uri);
      if (!parsed) return false;

      const url = objectUrl(c, parsed.key);
      const headers = signV4({
        method: "DELETE",
        url,
        headers: {},
        body: "",
        config: c,
      });

      const res = await fetch(url.toString(), { method: "DELETE", headers });

      // S3 returns 204 on success, 404 if already gone — both are fine.
      return res.ok || res.status === 404;
    },
  };
}
