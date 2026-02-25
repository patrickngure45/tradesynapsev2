import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { addArcadeXp } from "@/lib/arcade/progression";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  action_id: z.string().uuid(),
  option_code: z.string().min(1).max(80),
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
  const optionCode = String(input.option_code).trim();

  const sql = getSql();
  const rateLimitRes = await enforceAccountSecurityRateLimit({
    sql,
    request,
    limiterName: "arcade.draft.pick",
    windowMs: 60_000,
    max: 20,
    userId: actingUserId,
  });
  if (rateLimitRes) return rateLimitRes;

  try {
    const out = await retryOnceOnTransientDbError(async () => {
      return await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        const rows = await txSql<
          {
            id: string;
            user_id: string;
            module: string;
            status: string;
            reveal_json: any;
            outcome_json: any;
          }[]
        >`
          SELECT id::text AS id, user_id::text AS user_id, module, status, reveal_json, outcome_json
          FROM arcade_action
          WHERE id = ${actionId}::uuid
          LIMIT 1
          FOR UPDATE
        `;

        if (rows.length === 0) return { kind: "err" as const, err: apiError("not_found") };
        const action = rows[0]!;
        if (action.user_id !== actingUserId) return { kind: "err" as const, err: apiError("x_user_id_mismatch") };
        if (action.module !== "boost_draft") return { kind: "err" as const, err: apiError("invalid_input") };

        if (action.status === "resolved") {
          return { kind: "ok" as const, already: true, outcome: action.outcome_json };
        }

        if (action.status !== "ready") {
          return { kind: "err" as const, err: apiError("trade_state_conflict", { details: { status: action.status } }) };
        }

        const options: any[] = Array.isArray(action.reveal_json?.options) ? action.reveal_json.options : [];
        const picked = options.find((o) => String(o?.code ?? "") === optionCode);
        if (!picked) {
          return { kind: "err" as const, err: apiError("invalid_input", { details: "option_not_in_reveal" }) };
        }

        // Grant inventory.
        await txSql`
          INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
          VALUES (
            ${actingUserId}::uuid,
            ${String(picked.kind ?? "boost")},
            ${String(picked.code)},
            ${String(picked.rarity ?? "common")},
            1,
            ${txSql.json({ label: String(picked.label ?? "Boost"), ...(picked.metadata ?? {}), source: "boost_draft", action_id: actionId })},
            now(),
            now()
          )
          ON CONFLICT (user_id, kind, code, rarity)
          DO UPDATE SET quantity = arcade_inventory.quantity + 1, updated_at = now()
        `;

        const outcomeJson = {
          module: "boost_draft",
          picked,
          options,
          audit: action.reveal_json?.audit ?? {},
        };

          const ctx = String((outcomeJson as any)?.audit?.random_hashes?.[0] ?? (outcomeJson as any)?.audit?.random_hash ?? "");
          await addArcadeXp(txSql as any, {
            userId: actingUserId,
            deltaXp: 1,
            contextRandomHash: ctx || String(action.id ?? ""),
            source: "boost_draft",
          });

        await txSql`
          UPDATE arcade_action
          SET status = 'resolved',
              resolved_at = now(),
              outcome_json = ${txSql.json(outcomeJson)}
          WHERE id = ${actionId}::uuid
        `;

        return { kind: "ok" as const, already: false, outcome: outcomeJson };
      });
    });

    if (out.kind === "err") return out.err;

    return Response.json({ ok: true, already_picked: out.already, result: out.outcome }, { status: 200 });
  } catch (e) {
    const dep = responseForDbError("arcade_draft_pick", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
