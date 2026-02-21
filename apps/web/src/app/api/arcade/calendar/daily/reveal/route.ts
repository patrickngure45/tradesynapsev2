import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { isSha256Hex, sha256Hex } from "@/lib/uncertainty/hash";
import { resolveCalendarDaily } from "@/lib/arcade/calendarDaily";
import { logArcadeConsumption } from "@/lib/arcade/consumption";
import { addArcadeXp } from "@/lib/arcade/progression";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  action_id: z.string().uuid(),
  client_seed: z.string().min(8).max(256),
});

function utcDateIso(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
}

function dayIndexUtc(isoDate: string): number {
  // isoDate: YYYY-MM-DD
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  const d = Number(isoDate.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return 0;
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

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
  const moduleKey = "calendar_daily";

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
            outcome_json: any;
            input_json: any;
          }[]
        >`
          SELECT id::text AS id, user_id::text AS user_id, module, profile, status,
                 client_commit_hash, server_commit_hash, server_seed_b64, requested_at, outcome_json, input_json
          FROM arcade_action
          WHERE id = ${actionId}::uuid
          LIMIT 1
          FOR UPDATE
        `;

        if (rows.length === 0) return { kind: "err" as const, err: apiError("not_found") };
        const action = rows[0]!;
        if (action.user_id !== actingUserId) return { kind: "err" as const, err: apiError("x_user_id_mismatch") };
        if (action.module !== moduleKey) return { kind: "err" as const, err: apiError("invalid_input") };

        if (action.status === "resolved") {
          return { kind: "ok" as const, already: true, outcome: action.outcome_json };
        }
        if (action.status !== "committed") {
          return { kind: "err" as const, err: apiError("trade_state_conflict", { details: { status: action.status } }) };
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

        const claimDateIso = String(action.input_json?.claim_date ?? "").trim() || utcDateIso(new Date());

        const [state] = await txSql<
          { streak_count: number; best_streak: number; last_claim_date: string | null; pity_rare: number }[]
        >`
          SELECT streak_count, best_streak, last_claim_date::text AS last_claim_date, pity_rare
          FROM arcade_calendar_state
          WHERE user_id = ${actingUserId}::uuid AND module = ${moduleKey}
          LIMIT 1
          FOR UPDATE
        `;

        const pityRare = Number(state?.pity_rare ?? 0);

        const resolved = resolveCalendarDaily({
          actionId: action.id,
          userId: actingUserId,
          module: moduleKey,
          profile: action.profile,
          serverSeedB64: action.server_seed_b64,
          clientSeed,
          clientCommitHash: action.client_commit_hash,
          claimDateIso,
          pityRare,
        });

        const outcomeJson = {
          module: moduleKey,
          profile: action.profile,
          claim_date: claimDateIso,
          outcome: resolved.outcome,
          audit: {
            client_commit_hash: action.client_commit_hash,
            server_commit_hash: action.server_commit_hash,
            server_seed_b64: action.server_seed_b64,
            random_hash: resolved.audit.random_hash,
            roll: resolved.audit.roll,
            total: resolved.audit.total,
            pity_rare: resolved.audit.pity_rare,
          },
        };

        // Inventory stack.
        await txSql`
          INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
          VALUES (
            ${actingUserId}::uuid,
            ${resolved.outcome.kind},
            ${resolved.outcome.code},
            ${resolved.outcome.rarity},
            1,
            ${txSql.json({ label: resolved.outcome.label, source: moduleKey, claim_date: claimDateIso })},
            now(),
            now()
          )
          ON CONFLICT (user_id, kind, code, rarity)
          DO UPDATE SET quantity = arcade_inventory.quantity + 1, updated_at = now()
        `;

        // Update streak + pity state.
        const today = claimDateIso;
        const yesterdayIso = utcDateIso(new Date(Date.now() - 24 * 3600_000));
        const prev = state?.last_claim_date;

        let usedProtector = false;
        let nextStreak = 1;
        if (prev === yesterdayIso) {
          nextStreak = Number(state?.streak_count ?? 0) + 1;
        } else if (prev) {
          const gapDays = dayIndexUtc(today) - dayIndexUtc(prev);
          // If user missed exactly one day, allow a single protector to preserve the streak.
          if (gapDays === 2) {
            const perkRows = await txSql<{ id: string; quantity: number }[]>`
              SELECT id::text AS id, quantity
              FROM arcade_inventory
              WHERE user_id = ${actingUserId}::uuid
                AND kind = 'perk'
                AND code = 'streak_protector'
                AND rarity = 'rare'
              LIMIT 1
              FOR UPDATE
            `;
            const qty = Number(perkRows[0]?.quantity ?? 0);
            if (qty > 0) {
              usedProtector = true;
              nextStreak = Number(state?.streak_count ?? 0) + 1;

              if (qty === 1) {
                await txSql`
                  DELETE FROM arcade_inventory
                  WHERE id = ${perkRows[0]!.id}::uuid
                `;
              } else {
                await txSql`
                  UPDATE arcade_inventory
                  SET quantity = ${qty - 1}, updated_at = now()
                  WHERE id = ${perkRows[0]!.id}::uuid
                `;
              }

              await logArcadeConsumption(txSql, {
                user_id: actingUserId,
                kind: 'perk',
                code: 'streak_protector',
                rarity: 'rare',
                quantity: 1,
                context_type: 'calendar_daily',
                context_id: action.id,
                module: 'streak_protector',
                metadata: { claim_date: today, last_claim_date: prev },
              });
            }
          }
        }

        if (!usedProtector && prev !== yesterdayIso) {
          // Default: reset.
          nextStreak = 1;
        }
        const bestStreak = Math.max(Number(state?.best_streak ?? 0), nextStreak);

        const nextPity = (resolved.outcome.rarity === "rare" || resolved.outcome.rarity === "epic" || resolved.outcome.rarity === "legendary")
          ? 0
          : Math.min(50, pityRare + 1);

        await txSql`
          INSERT INTO arcade_calendar_state (user_id, module, streak_count, best_streak, last_claim_date, pity_rare, updated_at)
          VALUES (${actingUserId}::uuid, ${moduleKey}, ${nextStreak}, ${bestStreak}, ${today}::date, ${nextPity}, now())
          ON CONFLICT (user_id, module)
          DO UPDATE SET
            streak_count = EXCLUDED.streak_count,
            best_streak = EXCLUDED.best_streak,
            last_claim_date = EXCLUDED.last_claim_date,
            pity_rare = EXCLUDED.pity_rare,
            updated_at = now()
        `;

        await addArcadeXp(txSql as any, {
          userId: actingUserId,
          deltaXp: 1,
          contextRandomHash: resolved.audit.random_hash,
          source: "calendar_daily",
        });

        await txSql`
          UPDATE arcade_action
          SET status = 'resolved',
              resolved_at = now(),
              reveal_json = ${txSql.json({ client_seed_present: true })},
              outcome_json = ${txSql.json(outcomeJson)}
          WHERE id = ${actionId}::uuid
        `;

        return { kind: "ok" as const, already: false, outcome: outcomeJson };
      });
    });

    if (out.kind === "err") return out.err;

    return Response.json({ ok: true, action_id: actionId, already_resolved: out.already, result: out.outcome }, { status: 200 });
  } catch (e) {
    const dep = responseForDbError("arcade_calendar_reveal", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
