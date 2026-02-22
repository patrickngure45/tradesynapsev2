import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { isSha256Hex, sha256Hex } from "@/lib/uncertainty/hash";
import { resolveDailyDrop } from "@/lib/arcade/dailyDrop";
import { resolveSeasonalBadgeDrop } from "@/lib/arcade/seasonalBadges";
import { seasonalBadgePoolMetaFor } from "@/lib/arcade/seasonalBadgesMeta";
import { addArcadeXp } from "@/lib/arcade/progression";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  action_id: z.string().min(1),
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
            requested_at: string;
            resolved_at: string | null;
            input_json: any;
            outcome_json: any;
          }[]
        >`
          SELECT id, user_id, module, profile, status, client_commit_hash, server_commit_hash, server_seed_b64,
                 requested_at, resolved_at, input_json, outcome_json
          FROM arcade_action
          WHERE id = ${actionId}::uuid
          LIMIT 1
        `;

        if (rows.length === 0) {
          return { kind: "err" as const, err: apiError("not_found") };
        }

        const action = rows[0]!;
        if (action.user_id !== actingUserId) {
          return { kind: "err" as const, err: apiError("x_user_id_mismatch") };
        }

        if (action.status === "resolved") {
          return {
            kind: "ok" as const,
            alreadyResolved: true,
            action,
            outcome: action.outcome_json,
          };
        }

        if (action.status !== "committed") {
          return { kind: "err" as const, err: apiError("trade_state_conflict", { details: { status: action.status } }) };
        }

        const computedClientCommit = sha256Hex(clientSeed);
        if (!isSha256Hex(computedClientCommit) || computedClientCommit !== String(action.client_commit_hash ?? "").toLowerCase()) {
          return { kind: "err" as const, err: apiError("invalid_input", { details: "client_seed does not match commit" }) };
        }

        const expectedServerCommit = sha256Hex(
          action.module === "seasonal_badges"
            ? `${action.server_seed_b64}:${action.client_commit_hash}:${action.module}:${action.profile}:${actingUserId}:season=${String(
                (action.input_json as any)?.season_key ?? "",
              ).trim()}`
            : `${action.server_seed_b64}:${action.client_commit_hash}:${action.module}:${action.profile}:${actingUserId}`,
        );
        if (expectedServerCommit !== String(action.server_commit_hash ?? "").toLowerCase()) {
          return { kind: "err" as const, err: apiError("internal_error", { details: "server_commit_mismatch" }) };
        }

        const unlockedKeys: Array<{ kind: string; code: string; rarity: string; label: string; set_id?: string; season_key?: string }> = [];

        let resolved:
          | { outcome: any; audit: { random_hash: string } & Record<string, any> }
          | { outcome: any; audit: { random_hash: string } & Record<string, any> };

        if (action.module === "seasonal_badges") {
          const seasonKey = String((action.input_json as any)?.season_key ?? "").trim();
          if (!seasonKey) {
            return { kind: "err" as const, err: apiError("internal_error", { details: "missing_season_key" }) };
          }

          const meta = seasonalBadgePoolMetaFor(seasonKey);

          const r = resolveSeasonalBadgeDrop({
            actionId: action.id,
            userId: actingUserId,
            module: action.module,
            profile: action.profile,
            serverSeedB64: action.server_seed_b64,
            clientSeed,
            clientCommitHash: action.client_commit_hash,
            seasonKey,
          });
          resolved = r;

          // Track per-season unique collection + one-time set unlocks.
          const stateKey = `badge_pools:${seasonKey}`;
          const stRows = await txSql<{ value_json: any }[]>`
            SELECT value_json
            FROM arcade_state
            WHERE user_id = ${actingUserId}::uuid
              AND key = ${stateKey}
            LIMIT 1
            FOR UPDATE
          `;

          const current = stRows[0]?.value_json;
          const collected: Record<string, true> =
            current && typeof current === "object" && !Array.isArray(current) && current.collected && typeof current.collected === "object" && !Array.isArray(current.collected)
              ? (current.collected as Record<string, true>)
              : {};
          const unlockedSets: Record<string, true> =
            current && typeof current === "object" && !Array.isArray(current) && current.unlocked_sets && typeof current.unlocked_sets === "object" && !Array.isArray(current.unlocked_sets)
              ? (current.unlocked_sets as Record<string, true>)
              : {};

          collected[String(r.outcome.code)] = true;

          const newlyUnlocked: Array<{ setId: string; key: { kind: string; code: string; rarity: string; label: string } }> = [];
          for (const s of meta.sets) {
            if (unlockedSets[s.id]) continue;
            const complete = s.requiredCodes.every((c) => collected[c]);
            if (!complete) continue;
            unlockedSets[s.id] = true;
            newlyUnlocked.push({ setId: s.id, key: s.unlockKey });
          }

          await txSql`
            INSERT INTO arcade_state (user_id, key, value_json, created_at, updated_at)
            VALUES (
              ${actingUserId}::uuid,
              ${stateKey},
              ${txSql.json({ collected, unlocked_sets: unlockedSets })}::jsonb,
              now(),
              now()
            )
            ON CONFLICT (user_id, key)
            DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()
          `;

          for (const u of newlyUnlocked) {
            unlockedKeys.push({ ...u.key, set_id: u.setId, season_key: seasonKey });

            // One-time: do not increment quantity on conflict.
            await txSql`
              INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
              VALUES (
                ${actingUserId}::uuid,
                ${u.key.kind},
                ${u.key.code},
                ${u.key.rarity},
                1,
                ${txSql.json({ label: u.key.label, source: action.module, season_key: seasonKey, set_id: u.setId })}::jsonb,
                now(),
                now()
              )
              ON CONFLICT (user_id, kind, code, rarity)
              DO NOTHING
            `;
          }
        } else {
          const r = resolveDailyDrop({
            actionId: action.id,
            userId: actingUserId,
            module: action.module,
            profile: action.profile,
            serverSeedB64: action.server_seed_b64,
            clientSeed,
            clientCommitHash: action.client_commit_hash,
          });
          resolved = r as any;
        }

        const outcomeJson: any = {
          module: action.module,
          profile: action.profile,
          outcome: (resolved as any).outcome,
          audit: {
            client_commit_hash: action.client_commit_hash,
            server_commit_hash: action.server_commit_hash,
            server_seed_b64: action.server_seed_b64,
            ...(action.module === "seasonal_badges"
              ? {
                  random_hash: (resolved as any).audit.random_hash,
                  rarity_roll: (resolved as any).audit.rarity_roll,
                  rarity_total: (resolved as any).audit.rarity_total,
                  item_roll: (resolved as any).audit.item_roll,
                  item_total: (resolved as any).audit.item_total,
                }
              : {
                  random_hash: (resolved as any).audit.random_hash,
                  roll: (resolved as any).audit.roll,
                  total: (resolved as any).audit.total,
                }),
          },
        };

        if (unlockedKeys.length) outcomeJson.unlocks = { keys: unlockedKeys };

        // Inventory: upsert stack.
        await txSql`
          INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
          VALUES (
            ${actingUserId}::uuid,
            ${resolved.outcome.kind},
            ${resolved.outcome.code},
            ${resolved.outcome.rarity},
            1,
            ${txSql.json({ label: resolved.outcome.label, source: action.module })},
            now(),
            now()
          )
          ON CONFLICT (user_id, kind, code, rarity)
          DO UPDATE SET quantity = arcade_inventory.quantity + 1, updated_at = now()
        `;

        await addArcadeXp(txSql as any, {
          userId: actingUserId,
          deltaXp: 1,
          contextRandomHash: (resolved as any).audit.random_hash,
          source: action.module === "seasonal_badges" ? "seasonal_badges" : "daily_drop",
        });

        await txSql`
          UPDATE arcade_action
          SET status = 'resolved',
              resolved_at = now(),
              reveal_json = ${txSql.json({ client_seed_present: true })},
              outcome_json = ${txSql.json(outcomeJson)}
          WHERE id = ${actionId}::uuid
        `;

        return {
          kind: "ok" as const,
          alreadyResolved: false,
          action,
          outcome: outcomeJson,
        };
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
    const dep = responseForDbError("arcade_daily_reveal", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
