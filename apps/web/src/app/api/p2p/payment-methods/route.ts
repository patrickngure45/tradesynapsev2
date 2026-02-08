
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";

export const dynamic = "force-dynamic";

const createMethodSchema = z.object({
  identifier: z.string(), // e.g. 'mpesa', 'bank_transfer'
  name: z.string().min(1), // e.g. 'My Safaricom'
  details: z.any(), // e.g. { phoneNumber: '0712345678' }
});

export async function GET(req: NextRequest) {
  const actingUserId = getActingUserId(req);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  const sql = getSql();
  try {
    const methods = await sql`
      SELECT * FROM p2p_payment_method 
      WHERE user_id = ${actingUserId}::uuid 
      AND is_enabled = true
      ORDER BY created_at DESC
    `;
    return NextResponse.json({ methods });
  } catch (error: any) {
    return apiError("internal_error", { details: error.message });
  }
}

export async function POST(req: NextRequest) {
  const actingUserId = getActingUserId(req);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  try {
    const body = await req.json();
    const parsed = createMethodSchema.safeParse(body);
    if (!parsed.success) return apiZodError(parsed.error) ?? apiError("invalid_input");

    const { identifier, name, details } = parsed.data;
    const sql = getSql();

    const [newMethod] = await sql`
      INSERT INTO p2p_payment_method (user_id, identifier, name, details)
      VALUES (
        ${actingUserId}::uuid,
        ${identifier},
        ${name},
        ${details}
      )
      RETURNING *
    `;

    return NextResponse.json({ method: newMethod });
  } catch (error: any) {
    return apiError("internal_error", { details: error.message });
  }
}

export async function DELETE(req: NextRequest) {
    // Optional: Delete/Disable method
    // For brevity, skipping unless requested
    return apiError("not_implemented", { status: 501 });
}
