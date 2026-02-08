import { createPrivateKey, createPublicKey, sign } from "node:crypto";

import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getActingUserId, isParty, requireActingUserIdInProd } from "@/lib/auth/party";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { computeEvidenceCompleteness } from "@/lib/evidence/completeness";
import { sanitizeFilename } from "@/lib/evidence/local";
import { getStorageBackend } from "@/lib/evidence/storage";
import { sha256Hex } from "@/lib/proofpack/hash";
import type { ProofPackManifestV1 } from "@/lib/proofpack/types";
import { createZipStream } from "@/lib/proofpack/zip";
import type { NodeReadableLike } from "@/lib/proofpack/zip";

export const runtime = "nodejs";

const tradeIdSchema = z.string().uuid();

function jsonBuffer(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function nodeReadableToBuffer(stream: NodeReadableLike): Promise<Buffer> {
  const chunks: Buffer[] = [];

  return await new Promise<Buffer>((resolve, reject) => {
    stream.on("data", (chunk) => {
      if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk, "utf8"));
      } else if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
      } else {
        chunks.push(Buffer.from(String(chunk), "utf8"));
      }
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err) => reject(err));
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sql = getSql();
  const { id } = await params;

  try {
    tradeIdSchema.parse(id);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const url = new URL(request.url);
  const actingUserId = getActingUserId(request) ?? url.searchParams.get("user_id");
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) {
    return apiError(authErr);
  }

  let trade:
    | {
        id: string;
        buyer_user_id: string;
        seller_user_id: string;
        fiat_currency: string;
        crypto_asset: string;
        fiat_amount: string;
        crypto_amount: string;
        price: string;
        payment_method_label: string;
        payment_method_risk_class: "irreversible" | "reversible" | "unknown";
        status: string;
        reference_market_snapshot_id: string | null;
        fair_price_mid: string | null;
        fair_price_lower: string | null;
        fair_price_upper: string | null;
        fair_band_pct: string | null;
        fair_price_basis: string | null;
        price_deviation_pct: string | null;
        created_at: string;
      }
    | undefined;
  let transitions:
    | {
        id: string;
        from_status: string | null;
        to_status: string;
        actor_user_id: string | null;
        actor_type: string;
        reason_code: string | null;
        created_at: string;
      }[]
    | undefined;
  let risk_assessment_latest:
    | {
        id: string;
        score: number;
        version: string;
        factors_json: unknown;
        recommended_action: "allow" | "friction" | "bond" | "hold" | "block";
        market_snapshot_id: string | null;
        created_at: string;
      }
    | null
    | undefined;
  let evidence_objects:
    | {
        id: string;
        submitted_by_user_id: string;
        type: string;
        storage_uri: string;
        sha256: string;
        metadata_json: unknown;
        created_at: string;
      }[]
    | undefined;
  let dispute:
    | {
        id: string;
        trade_id: string;
        opened_by_user_id: string;
        reason_code: string;
        status: string;
        opened_at: string;
        resolved_at: string | null;
      }
    | null
    | undefined;
  let dispute_decisions:
    | {
        id: string;
        dispute_id: string;
        decision: string;
        rationale: string | null;
        decided_by: string;
        created_at: string;
      }[]
    | undefined;
  let marketSnapshot:
    | {
        id: string;
        exchange: string;
        symbol: string;
        last: string | null;
        bid: string | null;
        ask: string | null;
        ts: string;
        raw_json: unknown;
        created_at: string;
      }
    | null
    | undefined;

  try {
    const activeErr = await retryOnceOnTransientDbError(() =>
      requireActiveUser(sql, actingUserId)
    );
    if (activeErr) {
      return apiError(activeErr);
    }

    const trades = await retryOnceOnTransientDbError(async () => {
      return await sql<{
        id: string;
        buyer_user_id: string;
        seller_user_id: string;
        fiat_currency: string;
        crypto_asset: string;
        fiat_amount: string;
        crypto_amount: string;
        price: string;
        payment_method_label: string;
        payment_method_risk_class: "irreversible" | "reversible" | "unknown";
        status: string;
        reference_market_snapshot_id: string | null;
        fair_price_mid: string | null;
        fair_price_lower: string | null;
        fair_price_upper: string | null;
        fair_band_pct: string | null;
        fair_price_basis: string | null;
        price_deviation_pct: string | null;
        created_at: string;
      }[]>`
        SELECT
          id,
          buyer_user_id,
          seller_user_id,
          fiat_currency,
          crypto_asset,
          fiat_amount::text,
          crypto_amount::text,
          price::text,
          payment_method_label,
          payment_method_risk_class,
          status,
          reference_market_snapshot_id,
          fair_price_mid::text,
          fair_price_lower::text,
          fair_price_upper::text,
          fair_band_pct::text,
          fair_price_basis,
          price_deviation_pct::text,
          created_at
        FROM trade
        WHERE id = ${id}
        LIMIT 1
      `;
    });

    if (trades.length === 0) {
      return apiError("not_found");
    }

    trade = trades[0]!;

    if (actingUserId && !isParty(actingUserId, trade)) {
      return apiError("not_party");
    }

    transitions = await retryOnceOnTransientDbError(async () => {
      return await sql<{
        id: string;
        from_status: string | null;
        to_status: string;
        actor_user_id: string | null;
        actor_type: string;
        reason_code: string | null;
        created_at: string;
      }[]>`
        SELECT id, from_status, to_status, actor_user_id, actor_type, reason_code, created_at
        FROM trade_state_transition
        WHERE trade_id = ${id}
        ORDER BY created_at ASC
      `;
    });

    const riskRows = await retryOnceOnTransientDbError(async () => {
      return await sql<{
        id: string;
        score: number;
        version: string;
        factors_json: unknown;
        recommended_action: "allow" | "friction" | "bond" | "hold" | "block";
        market_snapshot_id: string | null;
        created_at: string;
      }[]>`
        SELECT id, score, version, factors_json, recommended_action, market_snapshot_id, created_at
        FROM risk_assessment
        WHERE trade_id = ${id}
        ORDER BY created_at DESC
        LIMIT 1
      `;
    });

    risk_assessment_latest = riskRows[0] ?? null;

    evidence_objects = await retryOnceOnTransientDbError(async () => {
      return await sql<{
        id: string;
        submitted_by_user_id: string;
        type: string;
        storage_uri: string;
        sha256: string;
        metadata_json: unknown;
        created_at: string;
      }[]>`
        SELECT id, submitted_by_user_id, type, storage_uri, sha256, metadata_json, created_at
        FROM evidence_object
        WHERE trade_id = ${id}
        ORDER BY created_at ASC
      `;
    });

    dispute =
      (
        await retryOnceOnTransientDbError(async () => {
          return await sql<{
            id: string;
            trade_id: string;
            opened_by_user_id: string;
            reason_code: string;
            status: string;
            opened_at: string;
            resolved_at: string | null;
          }[]>`
            SELECT id, trade_id, opened_by_user_id, reason_code, status, opened_at, resolved_at
            FROM dispute
            WHERE trade_id = ${id}
            LIMIT 1
          `;
        })
      )[0] ?? null;

    dispute_decisions = dispute
      ? await retryOnceOnTransientDbError(async () => {
          return await sql<{
            id: string;
            dispute_id: string;
            decision: string;
            rationale: string | null;
            decided_by: string;
            created_at: string;
          }[]>`
            SELECT id, dispute_id, decision, rationale, decided_by, created_at
            FROM dispute_decision
            WHERE dispute_id = ${dispute!.id}
            ORDER BY created_at ASC
          `;
        })
      : [];

    marketSnapshot = trade.reference_market_snapshot_id
      ? (
          await retryOnceOnTransientDbError(async () => {
            return await sql<{
              id: string;
              exchange: string;
              symbol: string;
              last: string | null;
              bid: string | null;
              ask: string | null;
              ts: string;
              raw_json: unknown;
              created_at: string;
            }[]>`
              SELECT
                id,
                exchange,
                symbol,
                last::text,
                bid::text,
                ask::text,
                ts,
                raw_json,
                created_at
              FROM market_snapshot
              WHERE id = ${trade!.reference_market_snapshot_id}
              LIMIT 1
            `;
          })
        )[0] ?? null
      : null;
  } catch (e) {
    const resp = responseForDbError("trades.proof_pack", e);
    if (resp) return resp;
    throw e;
  }

  trade = trade!;
  transitions = transitions!;
  evidence_objects = evidence_objects!;
  dispute = dispute!;
  dispute_decisions = dispute_decisions!;
  risk_assessment_latest = risk_assessment_latest!;
  marketSnapshot = marketSnapshot!;

  const files: Array<{ path: string; data: Buffer; mime: string }> = [];

  files.push({ path: "data/trade.json", data: jsonBuffer(trade), mime: "application/json" });
  files.push({
    path: "data/transitions.json",
    data: jsonBuffer(transitions),
    mime: "application/json",
  });
  files.push({
    path: "data/risk_assessment_latest.json",
    data: jsonBuffer(risk_assessment_latest),
    mime: "application/json",
  });
  files.push({
    path: "data/reference_market_snapshot.json",
    data: jsonBuffer(marketSnapshot),
    mime: "application/json",
  });
  files.push({
    path: "data/evidence_objects.json",
    data: jsonBuffer(evidence_objects),
    mime: "application/json",
  });
  files.push({
    path: "data/dispute.json",
    data: jsonBuffer(dispute),
    mime: "application/json",
  });
  files.push({
    path: "data/dispute_decisions.json",
    data: jsonBuffer(dispute_decisions),
    mime: "application/json",
  });

  const missingEvidence: Array<{ id: string; storage_uri: string; reason: string }> = [];

  const storage = getStorageBackend();

  for (const ev of evidence_objects) {
    try {
      const data = await storage.get(ev.storage_uri);
      if (!data) {
        missingEvidence.push({
          id: ev.id,
          storage_uri: ev.storage_uri,
          reason: "blob_not_found",
        });
        continue;
      }
      const meta = ev.metadata_json as Record<string, unknown> | null;
      const mime =
        meta && typeof meta === "object" && typeof meta.mime === "string"
          ? meta.mime
          : "application/octet-stream";
      // Derive a safe filename from the storage URI or sha256 fallback.
      const uriParts = ev.storage_uri.split("/");
      const rawName = uriParts.length > 0 ? decodeURIComponent(uriParts[uriParts.length - 1]!) : ev.sha256;
      const safeName = sanitizeFilename(rawName);
      files.push({
        path: `evidence/${ev.sha256}/${safeName}`,
        data,
        mime,
      });
    } catch (e) {
      missingEvidence.push({
        id: ev.id,
        storage_uri: ev.storage_uri,
        reason: e instanceof Error ? e.message : "read_failed",
      });
    }
  }

  if (missingEvidence.length > 0) {
    files.push({
      path: "data/evidence_missing.json",
      data: jsonBuffer(missingEvidence),
      mime: "application/json",
    });
  }

  const evidenceCompleteness = computeEvidenceCompleteness(
    evidence_objects.map((e) => ({ type: e.type, metadata_json: e.metadata_json }))
  );

  const latestTransition = transitions.length > 0 ? transitions[transitions.length - 1] : null;
  const terminalStatuses = new Set(["resolved", "canceled"]);
  const terminalStatus = terminalStatuses.has(trade.status) ? trade.status : null;
  const latestDisputeDecision =
    dispute_decisions.length > 0 ? dispute_decisions[dispute_decisions.length - 1] : null;

  const manifest: ProofPackManifestV1 = {
    manifest_version: "proofpack.manifest.v1",
    generated_at: new Date().toISOString(),
    trade_id: id,
    includes: {
      trade: true,
      transitions: true,
      risk_assessment_latest: true,
      reference_market_snapshot: true,
      evidence_objects: true,
      dispute: true,
      dispute_decisions: true,
      evidence_missing: missingEvidence.length > 0,
    },
    files: [],
    summary: {
      trade: {
        status: trade.status,
        terminal_status: terminalStatus,
        latest_transition: latestTransition
          ? {
              from_status: latestTransition.from_status,
              to_status: latestTransition.to_status,
              actor_user_id: latestTransition.actor_user_id,
              actor_type: latestTransition.actor_type,
              reason_code: latestTransition.reason_code,
              created_at: latestTransition.created_at,
            }
          : null,
        latest_dispute_decision: latestDisputeDecision
          ? {
              decision: latestDisputeDecision.decision,
              decided_by: latestDisputeDecision.decided_by,
              created_at: latestDisputeDecision.created_at,
            }
          : null,
      },
      risk_score: risk_assessment_latest?.score ?? null,
      recommended_action: risk_assessment_latest?.recommended_action ?? null,
      price_deviation_pct: trade.price_deviation_pct ?? null,
      evidence_completeness: evidenceCompleteness,
      dispute: {
        status: dispute?.status ?? null,
        reason_code: dispute?.reason_code ?? null,
        opened_at: dispute?.opened_at ?? null,
        resolved_at: dispute?.resolved_at ?? null,
        decisions_count: dispute_decisions.length,
      },
    },
  };

  for (const f of files) {
    manifest.files.push({
      path: f.path,
      bytes: f.data.byteLength,
      sha256: sha256Hex(f.data),
      mime: f.mime,
    });
  }

  const manifestBuf = jsonBuffer(manifest);
  files.push({ path: "manifest.json", data: manifestBuf, mime: "application/json" });

  const manifestSha256 = sha256Hex(manifestBuf);
  files.push({
    path: "manifest.sha256",
    data: Buffer.from(`${manifestSha256}  manifest.json\n`, "utf8"),
    mime: "text/plain",
  });

  const signingKeyPemRaw =
    process.env.PROOFPACK_SIGNING_PRIVATE_KEY_B64
      ? Buffer.from(process.env.PROOFPACK_SIGNING_PRIVATE_KEY_B64, "base64").toString("utf8")
      : process.env.PROOFPACK_SIGNING_PRIVATE_KEY;
  const signingKeyPem = signingKeyPemRaw?.includes("\\n")
    ? signingKeyPemRaw.replace(/\\n/g, "\n")
    : signingKeyPemRaw;

  if (signingKeyPem) {
    const privateKey = createPrivateKey(signingKeyPem);
    const publicKeyPem = createPublicKey(privateKey).export({ type: "spki", format: "pem" });
    const publicKeyPemStr =
      typeof publicKeyPem === "string" ? publicKeyPem : publicKeyPem.toString("utf8");

    const keyId = sha256Hex(Buffer.from(publicKeyPemStr, "utf8"));
    const signature = sign(null, Buffer.from(manifestSha256, "utf8"), privateKey);

    files.push({
      path: "public_key.pem",
      data: Buffer.from(publicKeyPemStr, "utf8"),
      mime: "application/x-pem-file",
    });

    files.push({
      path: "signature.json",
      data: jsonBuffer({
        signature_version: "proofpack.signature.v0",
        status: "signed",
        algorithm: "ed25519",
        key_id: keyId,
        payload: { type: "manifest_sha256", value: manifestSha256 },
        signature_b64: signature.toString("base64"),
        public_key_pem: publicKeyPemStr,
        public_key_pem_path: "public_key.pem",
        signed_at: new Date().toISOString(),
      }),
      mime: "application/json",
    });
  } else {
    files.push({
      path: "signature.json",
      data: jsonBuffer({
        signature_version: "proofpack.signature.v0",
        status: "unsigned",
        algorithm: null,
        key_id: null,
        payload: { type: "manifest_sha256", value: manifestSha256 },
        signature_b64: null,
        public_key_pem: null,
        public_key_pem_path: null,
        signed_at: null,
      }),
      mime: "application/json",
    });
  }

  const zipInputs = files.map((f) => ({ path: f.path, data: f.data }));
  const { zipStream } = createZipStream(zipInputs);

  const zipBuf = await nodeReadableToBuffer(zipStream);
  const body = zipBuf.buffer.slice(
    zipBuf.byteOffset,
    zipBuf.byteOffset + zipBuf.byteLength
  ) as ArrayBuffer;

  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
