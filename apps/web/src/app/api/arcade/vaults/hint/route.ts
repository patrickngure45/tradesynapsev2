import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { isSha256Hex, sha256Hex } from "@/lib/uncertainty/hash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  action_id: z.string().uuid(),
  client_seed: z.string().min(8).max(256),
});

function hintFromHash(randomHashHex: string): { tier: "dim" | "glow" | "flare" | "crown"; message: string } {
  const head = parseInt(randomHashHex.slice(0, 4), 16);
  const bucket = head % 1000;
  if (bucket < 740) return { tier: "dim", message: "A steady signal. Likely common." };
  if (bucket < 930) return { tier: "glow", message: "A brighter pulse. Rare is possible." };
  if (bucket < 985) return { tier: "flare", message: "A strong flare. Epic territory." };
  return { tier: "crown", message: "A crown shimmer. Legendary is on the table." };
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
            hint_json: any;
            hint_revealed_at: string | null;
          }[]
        >`
          SELECT id::text AS id, user_id::text AS user_id, module, profile, status,
                 client_commit_hash, server_commit_hash, server_seed_b64, resolves_at, input_json, hint_json, hint_revealed_at
          FROM arcade_action
          WHERE id = ${actionId}::uuid
          LIMIT 1
          FOR UPDATE
        `;

        if (rows.length === 0) return { kind: "err" as const, err: apiError("not_found") };
        const action = rows[0]!;
        if (action.user_id !== actingUserId) return { kind: "err" as const, err: apiError("x_user_id_mismatch") };
        if (action.module !== "time_vault") return { kind: "err" as const, err: apiError("invalid_input", { details: "not_time_vault" }) };

        // Only allow hint when hint_ready/ready/resolved.
        if (action.status !== "hint_ready" && action.status !== "ready" && action.status !== "resolved") {
          return { kind: "err" as const, err: apiError("trade_state_conflict", { details: { status: action.status } }) };
        }

        if (action.hint_revealed_at) {
          return { kind: "ok" as const, already: true, hint: action.hint_json };
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

        const randomHash = sha256Hex(`${action.server_seed_b64}:${clientSeed}:${actionId}:hint`);
        const hint = hintFromHash(randomHash);

        const hintJson = {
          module: action.module,
          profile: action.profile,
          hint,
          audit: {
            client_commit_hash: action.client_commit_hash,
            server_commit_hash: action.server_commit_hash,
            random_hash: randomHash,
          },
        };

        await txSql`
          UPDATE arcade_action
          SET hint_json = ${txSql.json(hintJson)},
              hint_revealed_at = now()
          WHERE id = ${actionId}::uuid
        `;

        return { kind: "ok" as const, already: false, hint: hintJson };
      });
    });

    if (out.kind === "err") return out.err;

    return Response.json({ ok: true, already_revealed: out.already, hint: out.hint }, { status: 200 });
  } catch (e) {
    const dep = responseForDbError("arcade_vault_hint", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
