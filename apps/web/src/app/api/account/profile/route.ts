import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/account/profile — fetch authenticated user's profile
 */
export async function GET(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const rows = await retryOnceOnTransientDbError(async () => {
      return await (sql as any)<{
        id: string;
        email: string | null;
        display_name: string | null;
        status: string;
        kyc_level: string;
        email_verified: boolean;
        totp_enabled: boolean;
        country: string | null;
        created_at: string;
        pay_fees_with_tst: boolean;
      }[]>`
        SELECT id, email, display_name, status, kyc_level, email_verified, totp_enabled, country, created_at, pay_fees_with_tst
        FROM app_user
        WHERE id = ${actingUserId}
        LIMIT 1
      `;
    });

    if (rows.length === 0) return apiError("user_not_found");

    return Response.json({ user: rows[0]! });
  } catch (e) {
    const resp = responseForDbError("account.profile", e);
    if (resp) return resp;
    throw e;
  }
}

/**
 * PATCH /api/account/profile — update profile settings
 */
export async function PATCH(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const body = await request.json();

    if (typeof body.pay_fees_with_tst === 'boolean') {
      await retryOnceOnTransientDbError(async () => {
        await sql`
          UPDATE app_user
          SET pay_fees_with_tst = ${body.pay_fees_with_tst}
          WHERE id = ${actingUserId}
        `;
      });
    }

    // Refresh and return
    const rows = await retryOnceOnTransientDbError(async () => {
      return await sql`SELECT id, pay_fees_with_tst FROM app_user WHERE id = ${actingUserId}`;
    });

    return Response.json({ user: rows[0] });

  } catch (e) {
    console.error("PATCH /api/account/profile error:", e);
    const resp = responseForDbError("account.profile.update", e);
    if (resp) return resp;
    return apiError("internal_error");
  }
}
