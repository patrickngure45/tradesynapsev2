import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  module: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: Request) {
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const url = new URL(request.url);
  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({
      module: url.searchParams.get("module") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const limit = q.limit ?? 25;
  const module = q.module ? String(q.module).trim() : null;

  const sql = getSql();

  try {
    const actions = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          id: string;
          module: string;
          profile: string;
          status: string;
          requested_at: string;
          resolves_at: string | null;
          resolved_at: string | null;
          input_json: unknown;
          outcome_json: unknown;
        }[]
      >`
        SELECT id::text AS id, module, profile, status, requested_at, resolves_at, resolved_at, input_json, outcome_json
        FROM arcade_action
        WHERE user_id = ${actingUserId}::uuid
          ${module ? sql`AND module = ${module}` : sql``}
        ORDER BY requested_at DESC
        LIMIT ${limit}
      `;
    });

    return Response.json({ ok: true, actions }, { status: 200 });
  } catch (e) {
    const dep = responseForDbError("arcade_actions_list", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
