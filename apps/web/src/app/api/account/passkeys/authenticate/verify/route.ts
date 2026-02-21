import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { responseForDbError } from "@/lib/dbTransient";
import { verifyAuthentication } from "@/lib/auth/webauthn";
import { createStepUpToken, serializeStepUpCookie } from "@/lib/auth/stepUp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  response: z.unknown(),
});

/**
 * POST /api/account/passkeys/authenticate/verify
 * Verifies an assertion response and sets a short-lived step-up cookie.
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
        AND kind = 'authenticate'
        AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (chalRows.length === 0) {
      return apiError("invalid_or_expired_token", {
        status: 400,
        details: { message: "Authentication challenge expired. Please try again." },
      });
    }

    // Load the credential referenced by the response ID
    const id = String((parsed.data.response as any)?.id ?? "");
    if (!id) {
      return apiError("invalid_input", { details: { message: "Missing credential id" } });
    }

    // The browser response.id is base64url; convert to raw bytes and look up.
    const idB64 = id.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (id.length % 4)) % 4);
    const idBuf = Buffer.from(idB64, "base64");
    const credRows = await sql<{ id: string; credential_id: Buffer; public_key: Buffer; counter: number }[]>`
      SELECT id, credential_id, public_key, counter
      FROM user_passkey_credential
      WHERE user_id = ${actingUserId}::uuid AND credential_id = ${idBuf}
      LIMIT 1
    `;
    const cred = credRows[0];

    if (!cred) {
      return apiError("not_found", { status: 404, details: { message: "Passkey not found" } });
    }

    const verification = await verifyAuthentication({
      response: parsed.data.response as any,
      expectedChallenge: chalRows[0]!.challenge,
      credential: {
        id,
        publicKey: new Uint8Array(cred.public_key),
        counter: cred.counter,
      },
    });

    if (!verification.verified || !verification.authenticationInfo) {
      return apiError("webauthn_verification_failed", {
        status: 400,
        details: { message: "Passkey verification failed." },
      });
    }

    const newCounter = verification.authenticationInfo.newCounter;
    await sql`
      UPDATE user_passkey_credential
      SET counter = ${newCounter}, last_used_at = now()
      WHERE id = ${cred.id}::uuid
    `;

    await sql`DELETE FROM webauthn_challenge WHERE id = ${chalRows[0]!.id}::uuid`;

    const secret = process.env.PROOFPACK_SESSION_SECRET ?? "";
    if (!secret) return apiError("session_secret_not_configured");

    const secure = process.env.NODE_ENV === "production";
    const ttl = 60 * 5;
    const token = createStepUpToken({ userId: actingUserId, secret, ttlSeconds: ttl });

    return Response.json(
      { ok: true, step_up: true, ttl_seconds: ttl },
      {
        status: 200,
        headers: {
          "set-cookie": serializeStepUpCookie({ token, maxAgeSeconds: ttl, secure }),
        },
      },
    );
  } catch (e) {
    const resp = responseForDbError("account.passkeys.authenticate.verify", e);
    if (resp) return resp;
    throw e;
  }
}
