import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";
import { getOrCreateDepositAddress } from "@/lib/blockchain/wallet";
import { getAllBalances } from "@/lib/blockchain/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/exchange/deposit-address
 *
 * Returns the user's BSC deposit address (creates one if needed).
 * Also returns on-chain balances for the deposit address.
 */
export async function GET(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const { address, isNew } = await getOrCreateDepositAddress(sql, actingUserId, "bsc");

    // Fetch on-chain balances (non-blocking — we return even if this fails)
    let onChainBalances: { symbol: string; balance: string; contractAddress: string | null }[] = [];
    try {
      onChainBalances = await getAllBalances(address);
    } catch {
      // On-chain query failed, return empty
    }

    return Response.json({
      address,
      chain: "bsc",
      is_new: isNew,
      on_chain_balances: onChainBalances,
    });
  } catch (e) {
    const resp = responseForDbError("exchange.deposit-address", e);
    if (resp) return resp;
    throw e;
  }
}
