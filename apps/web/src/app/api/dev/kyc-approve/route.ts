
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getActingUserId } from "@/lib/auth/party";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "dev_only" }, { status: 403 });
  }

  const sql = getSql();
  const userId = getActingUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const targetUserId = body.userId || userId; // Allow targeting other users if needed

  try {
    // 1. Find Pending Submission
    const submissions = await sql`
        SELECT id FROM kyc_submission 
        WHERE user_id = ${targetUserId} AND status = 'pending_review' 
        LIMIT 1
    `;

    if (submissions.length === 0) {
        // Fallback: Just force upgrade user even if no submission?
        // Force upgrade to highest tier ('full') directly if requested
        await sql`
            UPDATE app_user 
            SET kyc_level = 'full', 
                email_verified = true,
            WHERE id = ${targetUserId}
        `;
        return NextResponse.json({ message: "Forced upgrade to Full (No submission found)" });
    }

    const submissionId = submissions[0].id;

    // 2. Approve Submission
    await sql.begin(async (tx) => {
        const txSql = tx as any;
        await txSql`
            UPDATE kyc_submission
            SET status = 'approved',
                reviewed_by = ${userId},
                reviewed_at = now()
            WHERE id = ${submissionId}
        `;

        await txSql`
            UPDATE app_user 
            SET kyc_level = 'full'
            WHERE id = ${targetUserId}
        `;

        await createNotification(txSql, {
            userId: targetUserId,
            type: "system",
            title: "KYC Approved",
            body: "Your identity verification has been approved. You now have full access.",
            metadata: { submission_id: submissionId }
        });
    });

    return NextResponse.json({ success: true, message: "KYC Approved and User Verified" });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
