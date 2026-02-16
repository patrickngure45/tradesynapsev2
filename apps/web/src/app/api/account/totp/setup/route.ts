import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { generateTOTPSecret, buildTOTPUri } from "@/lib/auth/totp";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/totp/setup
 * Generate a new TOTP secret + otpauth URI for QR display.
 * Does NOT enable 2FA yet — the user must verify a code first.
 */
export async function POST(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr || !actingUserId) {
    return apiError(authErr ?? "unauthorized", { status: 401 });
  }

  // Check if already enabled
  const rows = await sql`
    SELECT email, totp_enabled FROM app_user WHERE id = ${actingUserId}
  `;
  if (rows.length === 0) {
    return apiError("user_not_found", { status: 404 });
  }
  if (rows[0]!.totp_enabled) {
    return apiError("totp_already_enabled", { status: 409 });
  }

  const secret = generateTOTPSecret();
  const uri = buildTOTPUri({ secret, email: rows[0]!.email ?? "user" });

  // Store the secret (not yet enabled) so we can verify in the enable step
  await sql`
    UPDATE app_user
    SET totp_secret = ${secret}, totp_enabled = false
    WHERE id = ${actingUserId}
  `;

  return Response.json({ secret, uri });
}
