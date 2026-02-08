import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, isParty, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

const createEvidenceSchema = z.object({
  submitted_by_user_id: z.string().uuid(),
  type: z.enum(["receipt", "screenshot", "bank_sms", "chat_export", "other"]),
  storage_uri: z.string().min(1).max(2048),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, "sha256 must be a 64-char hex string"),
  metadata_json: z.record(z.string(), z.unknown()).optional().default({}),
});

const tradeIdSchema = z.string().uuid();

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

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) {
    return apiError(authErr);
  }

  try {
    const activeErr = await retryOnceOnTransientDbError(() =>
      requireActiveUser(sql, actingUserId)
    );
    if (activeErr) {
      return apiError(activeErr);
    }

    if (actingUserId) {
      const trades = await retryOnceOnTransientDbError(async () => {
        return await sql<{ buyer_user_id: string; seller_user_id: string }[]>`
          SELECT buyer_user_id, seller_user_id
          FROM trade
          WHERE id = ${id}
          LIMIT 1
        `;
      });
      if (trades.length === 0) {
        return apiError("not_found");
      }
      if (!isParty(actingUserId, trades[0]!)) {
        return apiError("not_party");
      }
    }

    const evidence = await retryOnceOnTransientDbError(async () => {
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

    return Response.json({ evidence });
  } catch (e) {
    const resp = responseForDbError("trades.evidence.list", e);
    if (resp) return resp;
    throw e;
  }
}

export async function POST(
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

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) {
    return apiError(authErr);
  }

  try {
    const activeErr = await retryOnceOnTransientDbError(() =>
      requireActiveUser(sql, actingUserId)
    );
    if (activeErr) {
      return apiError(activeErr);
    }

  const json = await request.json().catch(() => ({}));
  let input: z.infer<typeof createEvidenceSchema>;
  try {
    input = createEvidenceSchema.parse(json);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  if (actingUserId && actingUserId !== input.submitted_by_user_id) {
    return apiError("x_user_id_mismatch");
  }

    if (actingUserId) {
      const trades = await retryOnceOnTransientDbError(async () => {
        return await sql<{ buyer_user_id: string; seller_user_id: string }[]>`
          SELECT buyer_user_id, seller_user_id
          FROM trade
          WHERE id = ${id}
          LIMIT 1
        `;
      });
      if (trades.length === 0) {
        return apiError("not_found");
      }
      if (!isParty(actingUserId, trades[0]!)) {
        return apiError("not_party");
      }
    }

  const rows = await (sql as any)<{
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
      ${id},
      ${input.submitted_by_user_id},
      ${input.type},
      ${input.storage_uri},
      ${input.sha256},
      ${input.metadata_json as any}::jsonb
    )
    RETURNING id, created_at
  `;

  return Response.json(
    {
      evidence_object: {
        id: rows[0]?.id,
        created_at: rows[0]?.created_at,
        ...input,
      },
    },
    { status: 201 }
  );
  } catch (e) {
    const resp = responseForDbError("trades.evidence.create", e);
    if (resp) return resp;
    throw e;
  }
}
