
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";

export const dynamic = "force-dynamic";

const createMethodSchema = z.object({
  identifier: z.string(), // e.g. 'mpesa', 'bank_transfer'
  name: z.string().min(1), // e.g. 'My Safaricom'
  details: z.any(), // e.g. { phoneNumber: '0712345678' }
});

const patchMethodSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  details: z.any().optional(),
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

  const sql = getSql();
  const rl = await enforceAccountSecurityRateLimit({
    sql: sql as any,
    request: req,
    limiterName: "p2p.payment_methods.create",
    windowMs: 60_000,
    max: 20,
    userId: actingUserId,
  });
  if (rl) return rl;

  try {
    const body = await req.json();
    const parsed = createMethodSchema.safeParse(body);
    if (!parsed.success) return apiZodError(parsed.error) ?? apiError("invalid_input");

    const { identifier, name, details } = parsed.data;

    // Never allow users to self-assign verified-agent status via this public endpoint.
    // Verified agents should be set via trusted admin tooling / server-side scripts.
    let safeDetails: any = details;
    if (details && typeof details === "object" && !Array.isArray(details)) {
      safeDetails = { ...(details as Record<string, unknown>) };
      if ("verifiedAgent" in safeDetails) {
        try {
          delete (safeDetails as any).verifiedAgent;
        } catch {
          // ignore
        }
      }
    }

    const [newMethod] = await sql`
      INSERT INTO p2p_payment_method (user_id, identifier, name, details)
      VALUES (
        ${actingUserId}::uuid,
        ${identifier},
        ${name},
        ${safeDetails}
      )
      RETURNING *
    `;

    return NextResponse.json({ method: newMethod });
  } catch (error: any) {
    return apiError("internal_error", { details: error.message });
  }
}

export async function DELETE(req: NextRequest) {
  const actingUserId = getActingUserId(req);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  const sql = getSql();
  const rl = await enforceAccountSecurityRateLimit({
    sql: sql as any,
    request: req,
    limiterName: "p2p.payment_methods.delete",
    windowMs: 60_000,
    max: 24,
    userId: actingUserId,
  });
  if (rl) return rl;

  const url = new URL(req.url);
  const id = String(url.searchParams.get("id") ?? "").trim();
  if (!id) return apiError("invalid_input", { status: 400, details: "Missing id" });

  try {
    const result = await sql`
      UPDATE p2p_payment_method
      SET is_enabled = false, updated_at = now()
      WHERE id = ${id}::uuid AND user_id = ${actingUserId}::uuid
    `;
    if (result.count === 0) return apiError("not_found", { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return apiError("internal_error", { details: error?.message ?? String(error) });
  }
}

export async function PATCH(req: NextRequest) {
  const actingUserId = getActingUserId(req);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  const sql = getSql();
  const rl = await enforceAccountSecurityRateLimit({
    sql: sql as any,
    request: req,
    limiterName: "p2p.payment_methods.patch",
    windowMs: 60_000,
    max: 24,
    userId: actingUserId,
  });
  if (rl) return rl;

  try {
    const body = await req.json();
    const parsed = patchMethodSchema.safeParse(body);
    if (!parsed.success) return apiZodError(parsed.error) ?? apiError("invalid_input");

    const { id, name, details } = parsed.data;
    if (name === undefined && details === undefined) {
      return NextResponse.json({ ok: true });
    }

    // Never allow users to self-assign verified-agent status via this public endpoint.
    let safeDetails: any = details;
    if (details && typeof details === "object" && !Array.isArray(details)) {
      safeDetails = { ...(details as Record<string, unknown>) };
      if ("verifiedAgent" in safeDetails) {
        try {
          delete (safeDetails as any).verifiedAgent;
        } catch {
          // ignore
        }
      }
    }

    const [updated] = await sql`
      UPDATE p2p_payment_method
      SET
        name = coalesce(${name ?? null}, name),
        details = coalesce(${safeDetails ?? null}, details),
        updated_at = now()
      WHERE id = ${id}::uuid
        AND user_id = ${actingUserId}::uuid
        AND is_enabled = true
      RETURNING *
    `;

    if (!updated) return apiError("not_found", { status: 404 });

    const ident = String((updated as any)?.identifier ?? "").toLowerCase();
    const det = (updated as any)?.details as any;
    if (ident === "mpesa") {
      const phoneNumber = typeof det?.phoneNumber === "string" ? det.phoneNumber.trim() : "";
      if (!phoneNumber) {
        return apiError("invalid_input", {
          status: 409,
          details: { message: "For mpesa, details.phoneNumber is required." },
        });
      }
    }

    return NextResponse.json({ method: updated });
  } catch (error: any) {
    return apiError("internal_error", { details: error.message });
  }
}


