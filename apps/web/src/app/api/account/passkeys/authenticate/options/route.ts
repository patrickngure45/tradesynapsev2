import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { responseForDbError } from "@/lib/dbTransient";
import { createAuthenticationOptions } from "@/lib/auth/webauthn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/passkeys/authenticate/options
 * Returns PublicKeyCredentialRequestOptionsJSON for @simplewebauthn/browser.
 */
export async function POST(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const creds = await sql<{ id: string; credential_id: Buffer }[]>`
      SELECT id, credential_id
      FROM user_passkey_credential
      WHERE user_id = ${actingUserId}::uuid
      ORDER BY created_at DESC
      LIMIT 20
    `;

    if (creds.length === 0) {
      return apiError("passkey_not_configured", {
        status: 409,
        details: { message: "No passkeys enrolled yet." },
      });
    }

    const options = await createAuthenticationOptions({
      allowCredentialIds: creds.map((c) => new Uint8Array(c.credential_id)),
    });

    await sql`
      INSERT INTO webauthn_challenge (user_id, kind, challenge, expires_at)
      VALUES (${actingUserId}::uuid, 'authenticate', ${options.challenge}, now() + interval '5 minutes')
    `;

    return Response.json({ ok: true, options });
  } catch (e) {
    const resp = responseForDbError("account.passkeys.authenticate.options", e);
    if (resp) return resp;
    throw e;
  }
}
