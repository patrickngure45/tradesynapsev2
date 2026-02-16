import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { quoteGasFee } from "@/lib/exchange/gas";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  action: z.string().min(1).max(100).default("withdrawal_request"),
  chain: z.string().min(1).max(32).default("bsc"),
  asset_symbol: z.string().min(1).max(16).optional(),
});

export async function GET(request: Request) {
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      action: url.searchParams.get("action") ?? undefined,
      chain: url.searchParams.get("chain") ?? undefined,
      asset_symbol: url.searchParams.get("asset_symbol") ?? undefined,
    });
    if (!parsed.success) return apiError("invalid_input", { details: parsed.error.flatten() });

    const q = await quoteGasFee(sql, {
      action: parsed.data.action,
      chain: parsed.data.chain,
      assetSymbol: parsed.data.asset_symbol,
      purpose: "display",
    });

    if ("code" in q) {
      return apiError(q.code, { status: 409, details: q.details });
    }

    return Response.json({ quote: q });
  } catch (e) {
    const resp = responseForDbError("exchange.gas.quote", e);
    if (resp) return resp;
    throw e;
  }
}
