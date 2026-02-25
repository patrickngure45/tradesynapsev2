import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? Number(v) : 20;
      if (!Number.isFinite(n)) return 20;
      return Math.max(1, Math.min(100, Math.trunc(n)));
    }),
});

export async function GET(request: Request) {
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const url = new URL(request.url);
  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({ limit: url.searchParams.get("limit") ?? undefined });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const sql = getSql();

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const rows = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          id: string;
          created_at: string;
          metadata_json: any;
          tx_hash: string | null;
          block_height: number | null;
        }[]
      >`
        SELECT
          je.id::text AS id,
          je.created_at::text AS created_at,
          je.metadata_json,
          tx.tx_hash,
          b.height AS block_height
        FROM ex_journal_entry je
        LEFT JOIN LATERAL (
          SELECT tx_hash, block_id
          FROM ex_chain_tx
          WHERE entry_id = je.id AND type = 'convert'
          ORDER BY created_at DESC
          LIMIT 1
        ) tx ON true
        LEFT JOIN ex_chain_block b ON b.id = tx.block_id
        WHERE je.type = 'convert'
          AND (je.metadata_json->>'user_id') = ${actingUserId}
        ORDER BY je.created_at DESC
        LIMIT ${q.limit}
      `;
    });

    const converts = rows.map((r) => {
      const meta = r.metadata_json ?? {};
      return {
        id: r.id,
        created_at: r.created_at,
        tx_hash: r.tx_hash,
        block_height: r.block_height,
        from: String(meta?.from ?? ""),
        to: String(meta?.to ?? ""),
        amount_in: String(meta?.amount_in ?? ""),
        amount_out: String(meta?.amount_out ?? ""),
        fee_in: String(meta?.fee_in ?? ""),
        rate_to_per_from: String(meta?.rate_to_per_from ?? ""),
      };
    });

    return Response.json({ ok: true, converts }, { status: 200 });
  } catch (e) {
    const resp = responseForDbError("exchange.convert.history", e);
    if (resp) return resp;
    throw e;
  }
}
