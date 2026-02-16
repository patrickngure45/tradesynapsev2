import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { amount3818PositiveSchema } from "@/lib/exchange/amount";
import { responseForDbError } from "@/lib/dbTransient";
import { logRouteResponse } from "@/lib/routeLog";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";
import { enforceTotpIfEnabled } from "@/lib/auth/requireTotp";
import { requestUserTransfer } from "@/lib/exchange/userTransfer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  asset_id: z.string().uuid(),
  amount: amount3818PositiveSchema,
  recipient_email: z.string().email(),
  reference: z.string().min(1).max(200).optional(),
  totp_code: z.string().length(6).regex(/^\d{6}$/).optional(),
});

export async function POST(request: Request) {
  const startMs = Date.now();
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const body = await request.json().catch(() => ({}));
    let input: z.infer<typeof requestSchema>;
    try {
      input = requestSchema.parse(body);
    } catch (e) {
      return apiZodError(e) ?? apiError("invalid_input");
    }

    const totpResp = await enforceTotpIfEnabled(sql, actingUserId, input.totp_code);
    if (totpResp) return totpResp;

    const result = await requestUserTransfer(sql, {
      actingUserId,
      assetId: input.asset_id,
      amount: input.amount,
      recipientEmail: input.recipient_email,
      reference: input.reference,
    });

    const err = result.body as { error?: string; details?: unknown };
    if (typeof err.error === "string") {
      return apiError(err.error, { status: result.status, details: err.details });
    }

    const response = Response.json(result.body, { status: result.status });
    logRouteResponse(request, response, {
      startMs,
      userId: actingUserId,
      meta: { transferId: (result.body as { transfer?: { id?: string } })?.transfer?.id },
    });

    try {
      const t = (result.body as { transfer?: { id?: string; amount?: string; asset_id?: string; recipient_email?: string } }).transfer;
      if (t?.id) {
        await writeAuditLog(sql, {
          actorId: actingUserId,
          actorType: "user",
          action: "transfer.requested",
          resourceType: "transfer",
          resourceId: t.id,
          ...auditContextFromRequest(request),
          detail: {
            amount: t.amount,
            asset_id: t.asset_id,
            recipient_email: t.recipient_email,
          },
        });
      }
    } catch {
      // non-blocking
    }

    return response;
  } catch (e) {
    const resp = responseForDbError("exchange.transfers.request", e);
    if (resp) return resp;
    console.error("exchange.transfers.request failed:", e);
    return apiError("internal_error", {
      details: {
        message: e instanceof Error ? e.message : String(e),
      },
    });
  }
}

