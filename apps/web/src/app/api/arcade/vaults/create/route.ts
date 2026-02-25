import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { amount3818PositiveSchema } from "@/lib/exchange/amount";
import { isSha256Hex, randomSeedB64, sha256Hex } from "@/lib/uncertainty/hash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  asset_id: z.string().uuid(),
  amount: amount3818PositiveSchema,
  duration_hours: z.number().int().min(24).max(168),
  profile: z.enum(["low", "medium", "high"]).default("low"),
  client_commit_hash: z.string().min(1),
});

export async function POST(request: Request) {
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const sql = getSql();
  const rateLimitRes = await enforceAccountSecurityRateLimit({
    sql,
    request,
    limiterName: "arcade.vaults.create",
    windowMs: 60_000,
    max: 20,
    userId: actingUserId,
  });
  if (rateLimitRes) return rateLimitRes;

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const json = await request.json().catch(() => ({}));
    let input: z.infer<typeof postSchema>;
    try {
      input = postSchema.parse(json);
    } catch (e) {
      return apiZodError(e) ?? apiError("invalid_input");
    }

    const clientCommit = String(input.client_commit_hash ?? "").trim().toLowerCase();
    if (!isSha256Hex(clientCommit)) return apiError("invalid_input", { details: "client_commit_hash must be sha256 hex" });

    const serverSeedB64 = randomSeedB64(32);
    const moduleKey = "time_vault";
    const serverCommit = sha256Hex(`${serverSeedB64}:${clientCommit}:${moduleKey}:${input.profile}:${actingUserId}`);

    const nowMs = Date.now();
    const resolvesAtMs = nowMs + input.duration_hours * 3600_000;
    const resolvesAtIso = new Date(resolvesAtMs).toISOString();
    const hintAtIso = new Date(nowMs + Math.floor((input.duration_hours * 3600_000) / 2)).toISOString();

    const created = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

      // Validate asset exists.
      const assets = await txSql<{ id: string; symbol: string; chain: string }[]>`
        SELECT id::text AS id, symbol, chain
        FROM ex_asset
        WHERE id = ${input.asset_id}::uuid AND is_enabled = true
        LIMIT 1
      `;
      if (assets.length === 0) return { status: 404 as const, body: { error: "not_found" } };

      // Ensure account.
      const accounts = await txSql<{ id: string }[]>`
        INSERT INTO ex_ledger_account (user_id, asset_id)
        VALUES (${actingUserId}::uuid, ${input.asset_id}::uuid)
        ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING id
      `;
      const accountId = accounts[0]!.id;

      // Balance check.
      const balRows = await txSql<{ posted: string; held: string; available: string; ok: boolean }[]>`
        WITH posted AS (
          SELECT coalesce(sum(amount), 0)::numeric AS posted
          FROM ex_journal_line
          WHERE account_id = ${accountId}
        ),
        held AS (
          SELECT coalesce(sum(remaining_amount), 0)::numeric AS held
          FROM ex_hold
          WHERE account_id = ${accountId} AND status = 'active'
        )
        SELECT
          posted.posted::text AS posted,
          held.held::text AS held,
          (posted.posted - held.held)::text AS available,
          ((posted.posted - held.held) >= (${input.amount}::numeric)) AS ok
        FROM posted, held
      `;
      const bal = balRows[0];
      if (!bal?.ok) {
        return {
          status: 409 as const,
          body: {
            error: "insufficient_balance",
            details: {
              posted: bal?.posted ?? "0",
              held: bal?.held ?? "0",
              available: bal?.available ?? "0",
              requested: input.amount,
            },
          },
        };
      }

      // Create action (scheduled).
      const [action] = await txSql<{ id: string; requested_at: string }[]>`
        INSERT INTO arcade_action (
          user_id,
          module,
          profile,
          status,
          client_commit_hash,
          server_commit_hash,
          server_seed_b64,
          input_json,
          resolves_at
        )
        VALUES (
          ${actingUserId}::uuid,
          ${moduleKey},
          ${input.profile},
          'scheduled',
          ${clientCommit},
          ${serverCommit},
          ${serverSeedB64},
          ${txSql.json({ asset_id: input.asset_id, amount: input.amount, duration_hours: input.duration_hours, hint_at: hintAtIso })},
          ${resolvesAtIso}::timestamptz
        )
        RETURNING id::text AS id, requested_at
      `;

      const reason = `arcade_vault:${action!.id}`;

      // Reserve principal.
      const [hold] = await txSql<{ id: string }[]>`
        INSERT INTO ex_hold (account_id, asset_id, amount, remaining_amount, reason, status)
        VALUES (
          ${accountId},
          ${input.asset_id}::uuid,
          (${input.amount}::numeric),
          (${input.amount}::numeric),
          ${reason},
          'active'
        )
        RETURNING id::text AS id
      `;

      return {
        status: 201 as const,
        body: {
          ok: true,
          action_id: action!.id,
          hold_id: hold!.id,
          module: moduleKey,
          profile: input.profile,
          resolves_at: resolvesAtIso,
          server_commit_hash: serverCommit,
        },
      };
    });

    const err = created.body as { error?: string; details?: unknown };
    if (typeof err.error === "string") {
      return apiError(err.error, { status: created.status, details: err.details });
    }

    return Response.json(created.body, { status: created.status });
  } catch (e) {
    const resp = responseForDbError("arcade_vault_create", e);
    if (resp) return resp;
    return apiError("internal_error");
  }
}
