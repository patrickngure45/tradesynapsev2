/**
 * POST /api/exchange/deposit/address
 *
 * Returns (or generates) the user's BSC deposit address via HD derivation.
 * Each user gets a unique address derived from CITADEL_MASTER_SEED.
 *
 * Response: { address: string, chain: string, is_new: boolean }
 */
import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { getOrCreateDepositAddress } from "@/lib/blockchain/wallet";
import { logRouteResponse } from "@/lib/routeLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startMs = Date.now();
  const userId = getActingUserId(request);
  const productionGuard = requireActingUserIdInProd(userId);
  if (productionGuard) return apiError(productionGuard, { status: 401 });

  if (!userId) {
    return apiError("unauthorized", { status: 401 });
  }

  const sql = getSql();

  try {
    // Verify user exists and is active
    const users = await sql<{ id: string; status: string }[]>`
      SELECT id, status FROM app_user WHERE id = ${userId} LIMIT 1
    `;
    if (users.length === 0) {
      return apiError("user_not_found", { status: 404 });
    }
    if (users[0]!.status !== "active") {
      return apiError("user_inactive", { status: 403 });
    }

    const { address, isNew } = await getOrCreateDepositAddress(sql, userId, "bsc");

    const response = Response.json({
      address,
      chain: "bsc",
      is_new: isNew,
    });

    logRouteResponse(request, response, { startMs, meta: { userId, isNew } });
    return response;
  } catch (e) {
    const resp = responseForDbError("exchange.deposit.address", e);
    if (resp) return resp;
    throw e;
  }
}
