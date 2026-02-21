import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { responseForDbError } from "@/lib/dbTransient";
import { createRegistrationOptions } from "@/lib/auth/webauthn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
});

/**
 * POST /api/account/passkeys/register/options
 * Returns PublicKeyCredentialCreationOptionsJSON for @simplewebauthn/browser.
 */
export async function POST(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return apiError("invalid_input", { details: parsed.error.format() });

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const userRows = await sql<{ email: string | null; display_name: string | null }[]>`
      SELECT email, display_name FROM app_user WHERE id = ${actingUserId}::uuid LIMIT 1
    `;
    if (userRows.length === 0) return apiError("user_not_found");

    const creds = await sql<{ credential_id: Buffer }[]>`
      SELECT credential_id
      FROM user_passkey_credential
      WHERE user_id = ${actingUserId}::uuid
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const email = userRows[0]!.email ?? "user";
    const displayName = userRows[0]!.display_name ?? email;

    const options = await createRegistrationOptions({
      userId: actingUserId,
      userName: email,
      userDisplayName: displayName,
      excludeCredentialIds: creds.map((c) => new Uint8Array(c.credential_id)),
    });

    await sql`
      INSERT INTO webauthn_challenge (user_id, kind, challenge, expires_at)
      VALUES (${actingUserId}::uuid, 'register', ${options.challenge}, now() + interval '5 minutes')
    `;

    return Response.json({ ok: true, options, name: parsed.data.name ?? null });
  } catch (e) {
    const resp = responseForDbError("account.passkeys.register.options", e);
    if (resp) return resp;
    throw e;
  }
}
