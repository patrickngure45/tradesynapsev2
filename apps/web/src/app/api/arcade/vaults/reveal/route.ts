import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { isSha256Hex, sha256Hex } from "@/lib/uncertainty/hash";
import { resolveTimeVault } from "@/lib/arcade/timeVault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  action_id: z.string().uuid(),
  client_seed: z.string().min(8).max(256),
});

export async function POST(request: Request) {
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const json = await request.json().catch(() => ({}));
  let input: z.infer<typeof postSchema>;
  try {
    input = postSchema.parse(json);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const actionId = String(input.action_id).trim();
  const clientSeed = String(input.client_seed).trim();

  const sql = getSql();

  try {
    const out = await retryOnceOnTransientDbError(async () => {
      return await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        const rows = await txSql<
          {
            id: string;
            user_id: string;
            module: string;
            profile: "low" | "medium" | "high";
            status: string;
            client_commit_hash: string;
            server_commit_hash: string;
            server_seed_b64: string;
            resolves_at: string | null;
            input_json: any;
            outcome_json: any;
          }[]
        >`
          SELECT id::text AS id, user_id::text AS user_id, module, profile, status,
                 client_commit_hash, server_commit_hash, server_seed_b64, resolves_at, input_json, outcome_json
          FROM arcade_action
          WHERE id = ${actionId}::uuid
          LIMIT 1
          FOR UPDATE
        `;

        if (rows.length === 0) return { kind: "err" as const, err: apiError("not_found") };
        const action = rows[0]!;
        if (action.user_id !== actingUserId) return { kind: "err" as const, err: apiError("x_user_id_mismatch") };
        if (action.module !== "time_vault") return { kind: "err" as const, err: apiError("invalid_input", { details: "not_time_vault" }) };

        if (action.status === "resolved") {
          return { kind: "ok" as const, alreadyResolved: true, outcome: action.outcome_json };
        }

        // Allow reveal when ready, or when resolves_at has passed (dev convenience).
        const due = action.resolves_at ? new Date(action.resolves_at).getTime() <= Date.now() : false;
        if (action.status !== "ready" && !(action.status === "scheduled" && due)) {
          return { kind: "err" as const, err: apiError("trade_state_conflict", { details: { status: action.status, resolves_at: action.resolves_at } }) };
        }

        if (action.status === "scheduled" && due) {
          await txSql`
            UPDATE arcade_action
            SET status = 'ready'
            WHERE id = ${actionId}::uuid AND status = 'scheduled'
          `;
          action.status = "ready";
        }

        const computedClientCommit = sha256Hex(clientSeed);
        if (!isSha256Hex(computedClientCommit) || computedClientCommit !== String(action.client_commit_hash ?? "").toLowerCase()) {
          return { kind: "err" as const, err: apiError("invalid_input", { details: "client_seed does not match commit" }) };
        }

        const expectedServerCommit = sha256Hex(
          `${action.server_seed_b64}:${action.client_commit_hash}:${action.module}:${action.profile}:${actingUserId}`,
        );
        if (expectedServerCommit !== String(action.server_commit_hash ?? "").toLowerCase()) {
          return { kind: "err" as const, err: apiError("internal_error", { details: "server_commit_mismatch" }) };
        }

        const assetId = String(action.input_json?.asset_id ?? "").trim();
        const amount = String(action.input_json?.amount ?? "").trim();
        const durationHours = Number(action.input_json?.duration_hours ?? 0);
        if (!assetId || !amount || !Number.isFinite(durationHours) || durationHours < 24) {
          return { kind: "err" as const, err: apiError("internal_error", { details: "invalid_action_input" }) };
        }

        const resolved = resolveTimeVault({
          actionId: action.id,
          userId: actingUserId,
          module: action.module,
          profile: action.profile,
          serverSeedB64: action.server_seed_b64,
          clientSeed,
          clientCommitHash: action.client_commit_hash,
          assetId,
          amount,
          durationHours,
        });

        const outcomeJson = {
          module: action.module,
          profile: action.profile,
          vault: {
            asset_id: assetId,
            amount,
            duration_hours: durationHours,
          },
          outcome: resolved.outcome,
          audit: {
            client_commit_hash: action.client_commit_hash,
            server_commit_hash: action.server_commit_hash,
            server_seed_b64: action.server_seed_b64,
            random_hash: resolved.audit.random_hash,
            roll: resolved.audit.roll,
            total: resolved.audit.total,
          },
        };

        // Release principal hold.
        const reason = `arcade_vault:${actionId}`;
        const holds = await txSql<{ id: string }[]>`
          SELECT h.id::text AS id
          FROM ex_hold h
          JOIN ex_ledger_account a ON a.id = h.account_id
          WHERE h.reason = ${reason}
            AND a.user_id = ${actingUserId}::uuid
          LIMIT 1
          FOR UPDATE
        `;

        if (holds.length === 0) {
          return { kind: "err" as const, err: apiError("internal_error", { details: "hold_not_found" }) };
        }

        await txSql`
          UPDATE ex_hold
          SET status = 'released', released_at = now()
          WHERE id = ${holds[0]!.id}::uuid AND status = 'active'
        `;

        // Grant inventory boost.
        await txSql`
          INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
          VALUES (
            ${actingUserId}::uuid,
            ${resolved.outcome.kind},
            ${resolved.outcome.code},
            ${resolved.outcome.rarity},
            1,
            ${txSql.json({ label: resolved.outcome.label, ...resolved.outcome.metadata, source: action.module, action_id: actionId })},
            now(),
            now()
          )
          ON CONFLICT (user_id, kind, code, rarity)
          DO UPDATE SET quantity = arcade_inventory.quantity + 1, updated_at = now()
        `;

        await txSql`
          UPDATE arcade_action
          SET status = 'resolved',
              resolved_at = now(),
              reveal_json = ${txSql.json({ client_seed_present: true })},
              outcome_json = ${txSql.json(outcomeJson)}
          WHERE id = ${actionId}::uuid
        `;

        return { kind: "ok" as const, alreadyResolved: false, outcome: outcomeJson };
      });
    });

    if (out.kind === "err") return out.err;

    return Response.json(
      {
        ok: true,
        action_id: actionId,
        already_resolved: out.alreadyResolved,
        result: out.outcome,
      },
      { status: 200 },
    );
  } catch (e) {
    const dep = responseForDbError("arcade_vault_reveal", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
