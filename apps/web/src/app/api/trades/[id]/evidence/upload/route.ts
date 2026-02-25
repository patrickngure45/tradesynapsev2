import { createHash } from "node:crypto";

import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, isParty, requireActingUserIdInProd } from "@/lib/auth/party";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";
import { sanitizeFilename } from "@/lib/evidence/local";
import { getStorageBackend } from "@/lib/evidence/storage";

export const runtime = "nodejs";

const fieldsSchema = z.object({
  submitted_by_user_id: z.string().uuid(),
  type: z.enum(["receipt", "screenshot", "bank_sms", "chat_export", "other"]),
  metadata_json: z.string().optional(),
});

const tradeIdSchema = z.string().uuid();

function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sql = getSql();
  const { id: tradeId } = await params;

  try {
    tradeIdSchema.parse(tradeId);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) {
    return apiError(authErr);
  }

  const rateLimitRes = await enforceAccountSecurityRateLimit({
    sql,
    request,
    limiterName: "trades.evidence.upload",
    windowMs: 60_000,
    max: 20,
    userId: actingUserId,
  });
  if (rateLimitRes) return rateLimitRes;

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) {
      return apiError(activeErr);
    }

  const form = await request.formData();

  let parsedFields: z.infer<typeof fieldsSchema>;
  try {
    parsedFields = fieldsSchema.parse({
      submitted_by_user_id: form.get("submitted_by_user_id"),
      type: form.get("type"),
      metadata_json: form.get("metadata_json") ?? undefined,
    });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  if (actingUserId && actingUserId !== parsedFields.submitted_by_user_id) {
    return apiError("x_user_id_mismatch");
  }

  if (actingUserId) {
    const trades = await sql<{ buyer_user_id: string; seller_user_id: string }[]>`
      SELECT buyer_user_id, seller_user_id
      FROM trade
      WHERE id = ${tradeId}
      LIMIT 1
    `;
    if (trades.length === 0) {
      return apiError("not_found");
    }
    if (!isParty(actingUserId, trades[0]!)) {
      return apiError("not_party");
    }
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return apiError("missing_file");
  }

  const filename = sanitizeFilename(file.name || "evidence.bin");
  const mime = file.type || "application/octet-stream";
  const buffer = Buffer.from(await file.arrayBuffer());
  const sha256 = sha256Hex(buffer);

  let extraMeta: Record<string, unknown> = {};
  if (parsedFields.metadata_json) {
    try {
      const value = JSON.parse(parsedFields.metadata_json);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        extraMeta = value as Record<string, unknown>;
      }
    } catch {
      return apiError("invalid_metadata_json");
    }
  }

  const storage = getStorageBackend();
  const storageRef = { tradeId, sha256, filename };
  const storageUri = await storage.put(storageRef, buffer);

  const metadata = {
    ...extraMeta,
    filename,
    mime,
    bytes: buffer.byteLength,
    stored_at: new Date().toISOString(),
    storage: storage.name,
  };

  const inserted = await (sql as any)<{
    id: string;
    created_at: string;
  }[]>`
    INSERT INTO evidence_object (
      trade_id,
      submitted_by_user_id,
      type,
      storage_uri,
      sha256,
      metadata_json
    ) VALUES (
      ${tradeId},
      ${parsedFields.submitted_by_user_id},
      ${parsedFields.type},
      ${storageUri},
      ${sha256},
      ${metadata as any}::jsonb
    )
    ON CONFLICT (trade_id, sha256)
    DO NOTHING
    RETURNING id, created_at
  `;

  if (inserted.length === 0) {
    const existing = await sql<{
      id: string;
      created_at: string;
    }[]>`
      SELECT id, created_at
      FROM evidence_object
      WHERE trade_id = ${tradeId} AND sha256 = ${sha256}
      LIMIT 1
    `;

    return Response.json(
      {
        evidence_object: {
          id: existing[0]?.id,
          created_at: existing[0]?.created_at,
          submitted_by_user_id: parsedFields.submitted_by_user_id,
          type: parsedFields.type,
          storage_uri: storageUri,
          sha256,
          metadata_json: metadata,
          deduped: true,
        },
      },
      { status: 200 }
    );
  }

  return Response.json(
    {
      evidence_object: {
        id: inserted[0]?.id,
        created_at: inserted[0]?.created_at,
        submitted_by_user_id: parsedFields.submitted_by_user_id,
        type: parsedFields.type,
        storage_uri: storageUri,
        sha256,
        metadata_json: metadata,
        deduped: false,
      },
    },
    { status: 201 }
  );
  } catch (e) {
    const resp = responseForDbError("trades.evidence.upload", e);
    if (resp) return resp;
    throw e;
  }
}
