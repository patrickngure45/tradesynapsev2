import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { enforceTotpRequired } from "@/lib/auth/requireTotp";
import { auditContextFromRequest, writeAuditLog } from "@/lib/auditLog";
import { getStepUpTokenFromRequest, verifyStepUpToken } from "@/lib/auth/stepUp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bscAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/i, "Invalid address")
  .transform((s) => s.toLowerCase());

const createSchema = z.object({
  chain: z.literal("bsc").optional().default("bsc"),
  address: bscAddress,
  label: z.string().min(1).max(64).optional(),
  totp_code: z.string().length(6).regex(/^\d{6}$/).optional(),
});

export async function GET(request: Request) {
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const rows = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          id: string;
          chain: string;
          address: string;
          label: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        }[]
      >`
        SELECT id, chain, address, label, status, created_at, updated_at
        FROM ex_withdrawal_allowlist
        WHERE user_id = ${actingUserId}
        ORDER BY created_at DESC
        LIMIT 100
      `;
    });

    return Response.json({ user_id: actingUserId, addresses: rows });
  } catch (e) {
    const resp = responseForDbError("exchange.withdrawals.allowlist.list", e);
    if (resp) return resp;
    throw e;
  }
}

export async function POST(request: Request) {
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const body = await request.json().catch(() => ({}));
    let input: z.infer<typeof createSchema>;
    try {
      input = createSchema.parse(body);
    } catch (e) {
      return apiZodError(e) ?? apiError("invalid_input");
    }

    // Security gates: email verified + strong auth.
    const uRows = await retryOnceOnTransientDbError(() =>
      sql<{ email_verified: boolean; totp_enabled: boolean }[]>`
        SELECT email_verified, totp_enabled
        FROM app_user
        WHERE id = ${actingUserId}::uuid
        LIMIT 1
      `
    );
    const u = uRows[0];
    if (!u) return apiError("user_not_found");
    if (!u.email_verified) {
      return apiError("email_not_verified", {
        status: 403,
        details: { message: "Verify your email before modifying withdrawal allowlists." },
      });
    }

    const secret = process.env.PROOFPACK_SESSION_SECRET ?? "";
    if (!secret) return apiError("session_secret_not_configured");

    const stepUpToken = getStepUpTokenFromRequest(request);
    const stepUp =
      typeof stepUpToken === "string" && stepUpToken
        ? verifyStepUpToken({ token: stepUpToken, secret })
        : null;
    const stepUpOk = !!stepUp && stepUp.ok && stepUp.payload.uid === actingUserId;

    if (!stepUpOk) {
      if (u.totp_enabled) {
        const totpResp = await enforceTotpRequired(sql, actingUserId, input.totp_code);
        if (totpResp) return totpResp;
      } else {
        const pk = await retryOnceOnTransientDbError(() =>
          sql<{ c: number }[]>`
            SELECT count(*)::int AS c
            FROM user_passkey_credential
            WHERE user_id = ${actingUserId}::uuid
          `
        );
        if ((pk[0]?.c ?? 0) > 0) {
          return apiError("stepup_required", {
            status: 403,
            details: { message: "Confirm with your passkey to continue." },
          });
        }
        return apiError("totp_setup_required", {
          status: 403,
          details: { message: "Set up 2FA or add a passkey before modifying allowlists." },
        });
      }
    }

    const rows = await retryOnceOnTransientDbError(async () =>
      await sql<
      {
        id: string;
        chain: string;
        address: string;
        label: string | null;
        status: string;
        created_at: string;
        updated_at: string;
      }[]
    >`
      INSERT INTO ex_withdrawal_allowlist (user_id, chain, address, label, status)
      VALUES (${actingUserId}, ${input.chain}, ${input.address}, ${input.label ?? null}, 'active')
      ON CONFLICT (user_id, chain, address) DO UPDATE
        SET label = COALESCE(EXCLUDED.label, ex_withdrawal_allowlist.label),
            status = 'active',
            updated_at = now()
      RETURNING id, chain, address, label, status, created_at, updated_at
    `
    );

    const ctx = auditContextFromRequest(request);
    await writeAuditLog(sql, {
      actorId: actingUserId,
      actorType: "user",
      action: "exchange.withdrawals.allowlist.upsert",
      resourceType: "withdrawal_allowlist",
      resourceId: rows[0]?.id ?? null,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      detail: {
        chain: input.chain,
        address: input.address,
        label: input.label ?? null,
      },
    });

    return Response.json({ address: rows[0] }, { status: 201 });
  } catch (e) {
    const resp = responseForDbError("exchange.withdrawals.allowlist.create", e);
    if (resp) return resp;
    throw e;
  }
}
