/**
 * Admin KYC review endpoints
 *
 * GET  — List KYC submissions (filterable by status)
 * POST — Approve or reject a submission
 */
import { z } from "zod";
import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/admin";
import { responseForDbError } from "@/lib/dbTransient";
import { logRouteResponse } from "@/lib/routeLog";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";
import { createNotification } from "@/lib/notifications";
import { sendMail } from "@/lib/email/transport";
import { kycApprovedEmail, kycRejectedEmail } from "@/lib/email/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reviewSchema = z.object({
  submission_id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  rejection_reason: z.string().max(500).optional(),
});

/**
 * GET /api/exchange/admin/kyc-review — list KYC submissions
 */
export async function GET(request: Request) {
  const sql = getSql();
  const admin = await requireAdmin(sql, request);
  if (!admin.ok) return apiError(admin.error);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "pending_review";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "50")));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0"));

  try {
    const rows = await sql`
      SELECT
        ks.id, ks.user_id::text AS user_id, ks.document_type,
        ks.status, ks.rejection_reason, ks.reviewed_by,
        ks.submitted_at, ks.reviewed_at,
        au.email, au.display_name, au.kyc_level
      FROM kyc_submission ks
      JOIN app_user au ON au.id = ks.user_id
      WHERE (${status} = 'all' OR ks.status = ${status})
      ORDER BY ks.submitted_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countRows = await sql<{ total: number }[]>`
      SELECT count(*)::int AS total FROM kyc_submission
      WHERE (${status} = 'all' OR status = ${status})
    `;

    return Response.json({
      submissions: rows,
      total: countRows[0]?.total ?? 0,
      limit,
      offset,
    });
  } catch (e) {
    const resp = responseForDbError("admin.kyc-review.list", e);
    if (resp) return resp;
    throw e;
  }
}

/**
 * POST /api/exchange/admin/kyc-review — approve or reject
 */
export async function POST(request: Request) {
  const startMs = Date.now();
  const sql = getSql();
  const admin = await requireAdmin(sql, request);
  if (!admin.ok) return apiError(admin.error);
  const body = await request.json().catch(() => ({}));

  let input: z.infer<typeof reviewSchema>;
  try {
    input = reviewSchema.parse(body);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const reviewedBy = admin.userId;

  try {
    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

      const rows = await txSql<{ id: string; user_id: string; status: string }[]>`
        SELECT id, user_id::text AS user_id, status
        FROM kyc_submission
        WHERE id = ${input.submission_id}
        LIMIT 1
      `;

      if (rows.length === 0) return { status: 404 as const, body: { error: "not_found" } };
      const sub = rows[0]!;

      if (sub.status !== "pending_review") {
        return { status: 409 as const, body: { error: "already_reviewed" } };
      }

      // Get user email for notification
      const userRows = await txSql<{ email: string | null }[]>`
        SELECT email FROM app_user WHERE id = ${sub.user_id}::uuid LIMIT 1
      `;
      const userEmail = userRows[0]?.email;

      await txSql`
        UPDATE kyc_submission
        SET status = ${input.decision},
            rejection_reason = ${input.rejection_reason ?? null},
            reviewed_by = ${reviewedBy},
            reviewed_at = now(),
            updated_at = now()
        WHERE id = ${input.submission_id}
      `;

      if (input.decision === "approved") {
        // Upgrade user to verified
        await txSql`
          UPDATE app_user SET kyc_level = 'verified', updated_at = now()
          WHERE id = ${sub.user_id}::uuid AND kyc_level != 'verified'
        `;

        await createNotification(txSql, {
          userId: sub.user_id,
          type: "system",
          title: "KYC Approved",
          body: "Your identity has been verified. You now have full access.",
          metadata: { submission_id: input.submission_id },
        });
      } else {
        await createNotification(txSql, {
          userId: sub.user_id,
          type: "system",
          title: "KYC Rejected",
          body: input.rejection_reason
            ? `Your KYC submission was rejected: ${input.rejection_reason}`
            : "Your KYC submission was rejected. Please re-submit with clearer documents.",
          metadata: { submission_id: input.submission_id, reason: input.rejection_reason },
        });
      }

      return {
        status: 200 as const,
        body: { ok: true, submission_id: input.submission_id, decision: input.decision },
        userId: sub.user_id,
        email: userEmail,
      };
    });

    const err = result.body as { error?: string };
    if (typeof err.error === "string") {
      return apiError(err.error, { status: result.status });
    }

    const response = Response.json(result.body, { status: result.status });
    logRouteResponse(request, response, { startMs, meta: { submissionId: input.submission_id } });

    // Send email notification (best-effort, outside transaction)
    if (result.email) {
      try {
        const tpl = input.decision === "approved"
          ? kycApprovedEmail()
          : kycRejectedEmail(input.rejection_reason ?? "Documents did not meet requirements");
        await sendMail({ to: result.email, subject: tpl.subject, text: tpl.text, html: tpl.html });
      } catch (emailErr) {
        console.error("[kyc-review] Failed to send notification email:", emailErr instanceof Error ? emailErr.message : emailErr);
      }
    }

    try {
      await writeAuditLog(sql, {
        actorType: "admin",
        action: `kyc.${input.decision}`,
        resourceType: "kyc_submission",
        resourceId: input.submission_id,
        ...auditContextFromRequest(request),
        detail: { decision: input.decision, rejection_reason: input.rejection_reason },
      });
    } catch (auditErr) {
      console.error("[kyc-review] Failed to write audit log:", auditErr instanceof Error ? auditErr.message : auditErr);
    }

    return response;
  } catch (e) {
    const resp = responseForDbError("admin.kyc-review.decide", e);
    if (resp) return resp;
    throw e;
  }
}
