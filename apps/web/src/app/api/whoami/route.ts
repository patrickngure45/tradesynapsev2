import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);

  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) {
    return apiError(authErr);
  }

  if (!actingUserId) {
    return Response.json({ user_id: null, user: null }, { status: 200 });
  }

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) {
      return apiError(activeErr);
    }

    const rows = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          id: string;
          status: string;
          kyc_level: string;
          country: string | null;
          created_at: string;
        }[]
      >`
        SELECT id, status, kyc_level, country, created_at
        FROM app_user
        WHERE id = ${actingUserId}
        LIMIT 1
      `;
    });

    if (rows.length === 0) {
      return apiError("user_not_found");
    }

    return Response.json({ user_id: actingUserId, user: rows[0]! });
  } catch (e) {
    const resp = responseForDbError("whoami.get", e);
    if (resp) return resp;
    throw e;
  }
}
