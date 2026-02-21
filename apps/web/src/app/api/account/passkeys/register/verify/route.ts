import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { responseForDbError } from "@/lib/dbTransient";
import { verifyRegistration } from "@/lib/auth/webauthn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function base64UrlToBuffer(id: string): Buffer {
  const b64 = id.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (id.length % 4)) % 4);
  return Buffer.from(b64, "base64");
}

const bodySchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  response: z.unknown(),
});

/**
 * POST /api/account/passkeys/register/verify
 * Verifies the attestation response and stores the credential.
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

    const chalRows = await sql<{ id: string; challenge: string }[]>`
      SELECT id, challenge
      FROM webauthn_challenge
      WHERE user_id = ${actingUserId}::uuid
        AND kind = 'register'
        AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (chalRows.length === 0) {
      return apiError("invalid_or_expired_token", {
        status: 400,
        details: { message: "Registration challenge expired. Please try again." },
      });
    }

    const expectedChallenge = chalRows[0]!.challenge;

    const verification = await verifyRegistration({
      // @simplewebauthn expects a RegistrationResponseJSON shape
      response: parsed.data.response as any,
      expectedChallenge,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return apiError("webauthn_verification_failed", {
        status: 400,
        details: { message: "Passkey verification failed." },
      });
    }

    const { credential } = verification.registrationInfo;
    const credentialIdBuf = base64UrlToBuffer(credential.id);

    const name = parsed.data.name ?? "Passkey";

    const rows = await sql<{ id: string; created_at: string }[]>`
      INSERT INTO user_passkey_credential (user_id, name, credential_id, public_key, counter, transports)
      VALUES (
        ${actingUserId}::uuid,
        ${name},
        ${credentialIdBuf},
        ${Buffer.from(credential.publicKey)},
        ${credential.counter},
        ${credential.transports ?? null}
      )
      RETURNING id, created_at
    `;

    await sql`DELETE FROM webauthn_challenge WHERE id = ${chalRows[0]!.id}::uuid`;

    return Response.json({ ok: true, passkey: { id: rows[0]!.id, name, created_at: rows[0]!.created_at } });
  } catch (e) {
    const resp = responseForDbError("account.passkeys.register.verify", e);
    if (resp) return resp;
    throw e;
  }
}
