/**
 * TOTP enforcement helper.
 *
 * Gate sensitive operations behind a TOTP check when the user has 2FA enabled.
 * Returns null if the request is allowed, or a Response to short-circuit with.
 */

import type postgres from "postgres";
import { verifyTOTP } from "@/lib/auth/totp";

type Sql = ReturnType<typeof postgres>;

/**
 * If the user has TOTP enabled, verify the `totp_code` field from the body.
 *
 * @returns null — allowed (no 2FA or code is valid)
 * @returns Response — 403 to return immediately
 */
export async function enforceTotpIfEnabled(
  sql: Sql,
  userId: string,
  totpCode: string | null | undefined,
): Promise<Response | null> {
  const rows = await sql<{ totp_enabled: boolean; totp_secret: string | null }[]>`
    SELECT totp_enabled, totp_secret FROM app_user WHERE id = ${userId} LIMIT 1
  `;

  if (rows.length === 0) return null; // user not found handled elsewhere
  if (!rows[0]!.totp_enabled || !rows[0]!.totp_secret) return null; // 2FA not enabled

  // 2FA is enabled — code is required
  const code = String(totpCode ?? "").trim();
  if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
    return Response.json(
      { error: "totp_required", message: "A valid 6-digit 2FA code is required for this operation." },
      { status: 403 },
    );
  }

  if (!verifyTOTP(rows[0]!.totp_secret, code)) {
    return Response.json(
      { error: "invalid_totp_code", message: "The 2FA code is incorrect or expired." },
      { status: 403 },
    );
  }

  return null; // allowed
}

/**
 * Require TOTP to be enabled and verify the provided code.
 *
 * @returns null — allowed
 * @returns Response — 403 to return immediately
 */
export async function enforceTotpRequired(
  sql: Sql,
  userId: string,
  totpCode: string | null | undefined,
): Promise<Response | null> {
  const rows = await sql<{ totp_enabled: boolean; totp_secret: string | null }[]>`
    SELECT totp_enabled, totp_secret FROM app_user WHERE id = ${userId} LIMIT 1
  `;

  if (rows.length === 0) return null; // user not found handled elsewhere
  if (!rows[0]!.totp_enabled || !rows[0]!.totp_secret) {
    return Response.json(
      {
        error: "totp_setup_required",
        message: "2FA must be enabled for this operation.",
      },
      { status: 403 },
    );
  }

  const code = String(totpCode ?? "").trim();
  if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
    return Response.json(
      { error: "totp_required", message: "A valid 6-digit 2FA code is required for this operation." },
      { status: 403 },
    );
  }

  if (!verifyTOTP(rows[0]!.totp_secret, code)) {
    return Response.json(
      { error: "invalid_totp_code", message: "The 2FA code is incorrect or expired." },
      { status: 403 },
    );
  }

  return null;
}
