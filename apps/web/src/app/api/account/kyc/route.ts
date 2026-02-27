import { z } from "zod";
import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { responseForDbError } from "@/lib/dbTransient";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KYC_TIERS = ["none", "basic", "full"] as const;

const upgradeSchema = z.object({
  action: z.literal("upgrade"),
});

const submitDocSchema = z.object({
  action: z.literal("submit_documents"),
  document_type: z.enum(["passport", "national_id", "drivers_license"]),
  document_front: z.string().min(100).max(2_000_000), // base64 image
  document_back: z.string().min(100).max(2_000_000).optional(),
  selfie: z.string().min(100).max(2_000_000).optional(),
});

const schema = z.union([upgradeSchema, submitDocSchema]);

/**
 * POST /api/account/kyc
 *
 * Two modes:
 *   { action: "upgrade" }          — auto-upgrades none→basic (email verify check)
 *   { action: "submit_documents" } — submits KYC documents for basic→verified review
 */
export async function POST(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  const rl = await enforceAccountSecurityRateLimit({
    sql: sql as any,
    request,
    limiterName: "account.kyc.post",
    windowMs: 60_000,
    max: 12,
    userId: actingUserId,
  });
  if (rl) return rl;

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("invalid_input", { details: parsed.error.format() });

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const rows = await sql<{ kyc_level: string; email_verified: boolean }[]>`
      SELECT kyc_level, email_verified FROM app_user WHERE id = ${actingUserId} LIMIT 1
    `;
    if (rows.length === 0) return apiError("user_not_found");

    const current = rows[0]!.kyc_level;
    const input = parsed.data;

    // ── Mode 1: Simple upgrade (none → basic via email verification) ──
    if (input.action === "upgrade") {
      if (current !== "none") {
        return apiError("already_max_kyc", { status: 409 });
      }
      if (!rows[0]!.email_verified) {
        return apiError("email_not_verified", {
          status: 403,
          details: { message: "Verify your email before upgrading your KYC tier." },
        });
      }
      const nextTier = "basic";
      await sql`
        UPDATE app_user SET kyc_level = ${nextTier}
        WHERE id = ${actingUserId}
      `;
      await createNotification(sql, {
        userId: actingUserId,
        type: "system",
        title: "KYC Upgraded",
        body: `Your verification level has been upgraded to ${nextTier}.`,
        metadata: { from: current, to: nextTier },
      });
      return Response.json({ ok: true, kyc_level: nextTier });
    }

    // ── Mode 2: Document submission (basic → full, pending admin review) ──
    if (current !== "basic") {
      return apiError("kyc_documents_require_basic", {
        status: 409,
        details: { message: "Verify your email first to reach Basic tier before submitting documents" },
      });
    }

    // Check for existing pending submission
    const pending = await sql<{ id: string }[]>`
      SELECT id FROM kyc_submission
      WHERE user_id = ${actingUserId} AND status = 'pending_review'
      LIMIT 1
    `;
    if (pending.length > 0) {
      return apiError("kyc_submission_pending", {
        status: 409,
        details: { message: "You already have a pending KYC submission under review" },
      });
    }

    // Insert submission
    const sub = await sql<{ id: string }[]>`
      INSERT INTO kyc_submission (user_id, document_type, document_front, document_back, selfie)
      VALUES (
        ${actingUserId},
        ${input.document_type},
        ${input.document_front},
        ${input.document_back ?? null},
        ${input.selfie ?? null}
      )
      RETURNING id
    `;

    await createNotification(sql, {
      userId: actingUserId,
      type: "system",
      title: "KYC Documents Submitted",
      body: "Your identity documents are under review. This usually takes 1–2 business days.",
      metadata: { submission_id: sub[0]!.id },
    });

    return Response.json({
      ok: true,
      submission_id: sub[0]!.id,
      status: "pending_review",
      message: "Documents submitted for review",
    });
  } catch (e) {
    const resp = responseForDbError("account.kyc", e);
    if (resp) return resp;
    throw e;
  }
}

/**
 * GET /api/account/kyc — Get current KYC status + submissions
 */
export async function GET(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  try {
    const rows = await sql<{ kyc_level: string }[]>`
      SELECT kyc_level FROM app_user WHERE id = ${actingUserId} LIMIT 1
    `;
    if (rows.length === 0) return apiError("user_not_found");

    const submissions = await sql<{ id: string; document_type: string; status: string; rejection_reason: string | null; submitted_at: string }[]>`
      SELECT id, document_type, status, rejection_reason, submitted_at
      FROM kyc_submission
      WHERE user_id = ${actingUserId}
      ORDER BY submitted_at DESC
      LIMIT 10
    `;

    return Response.json({
      kyc_level: rows[0]!.kyc_level,
      submissions,
    });
  } catch (e) {
    const resp = responseForDbError("account.kyc.get", e);
    if (resp) return resp;
    throw e;
  }
}
