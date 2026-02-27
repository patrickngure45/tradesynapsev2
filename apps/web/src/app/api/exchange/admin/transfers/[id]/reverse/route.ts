import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";
import { requireAdminForApi } from "@/lib/auth/admin";
import { logRouteResponse } from "@/lib/routeLog";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";
import { reverseUserTransfer } from "@/lib/exchange/userTransfer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

const postSchema = z
  .object({
    reason: z.string().min(1).max(500).optional(),
  })
  .optional();

/** POST /api/exchange/admin/transfers/[id]/reverse */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startMs = Date.now();
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  const { id } = await params;
  try {
    idSchema.parse(id);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const body = await request.json().catch(() => ({}));
  let input: z.infer<NonNullable<typeof postSchema>> | undefined;
  try {
    input = postSchema.parse(body);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    const result = await reverseUserTransfer(sql, {
      adminUserId: admin.userId,
      originalTransferEntryId: id,
      reason: input?.reason,
    });

    if ("error" in result.body) {
      const details = "details" in result.body ? result.body.details : undefined;
      return apiError(result.body.error, { status: result.status, details });
    }

    const reversal = result.body.reversal;

    const response = Response.json(result.body, { status: result.status });
    logRouteResponse(request, response, {
      startMs,
      userId: admin.userId,
      meta: { originalTransferId: id, reversalId: reversal.id },
    });

    try {
      await writeAuditLog(sql, {
        actorId: admin.userId,
        actorType: "user",
        action: "transfer.reversed",
        resourceType: "transfer",
        resourceId: id,
        ...auditContextFromRequest(request),
        detail: {
          reversal_id: reversal.id,
          amount: reversal.amount,
          asset_id: reversal.asset_id,
          reason: input?.reason ?? null,
        },
      });
    } catch {
      // non-blocking
    }

    return response;
  } catch (e) {
    const resp = responseForDbError("exchange.admin.transfers.reverse", e);
    if (resp) return resp;
    console.error("exchange.admin.transfers.reverse failed:", e);
    return apiError("internal_error", {
      details: {
        message: e instanceof Error ? e.message : String(e),
      },
    });
  }
}
