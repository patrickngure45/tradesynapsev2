import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/account/passkeys
 * List enrolled passkeys for the current user.
 */
export async function GET(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const rows = await sql<{ id: string; name: string | null; created_at: string; last_used_at: string | null }[]>`
      SELECT id, name, created_at, last_used_at
      FROM user_passkey_credential
      WHERE user_id = ${actingUserId}::uuid
      ORDER BY created_at DESC
      LIMIT 50
    `;

    return Response.json({ ok: true, passkeys: rows });
  } catch (e) {
    const resp = responseForDbError("account.passkeys.list", e);
    if (resp) return resp;
    throw e;
  }
}
