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
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z
  .object({
    chain: z.enum(["bsc", "eth"]).optional().default("bsc"),
  })
  .optional();

function parseCsvSymbols(raw: string): string[] {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

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
    const body = await request.json().catch(() => ({}));
    const input = inputSchema?.parse(body);
    const chain = input?.chain ?? "bsc";

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

    const { address, isNew } = await getOrCreateDepositAddress(sql, userId, chain);

    const tokenScanEnabledRaw = String(process.env.DEPOSIT_SCAN_TOKENS ?? "1").trim().toLowerCase();
    const tokenScanEnabled = !(tokenScanEnabledRaw === "0" || tokenScanEnabledRaw === "false");
    const allowTokenScanAll = String(process.env.ALLOW_TOKEN_SCAN_ALL ?? "").trim() === "1";
    const allowlistedSymbols = parseCsvSymbols(String(process.env.DEPOSIT_SCAN_SYMBOLS ?? ""));

    const supported =
      chain === "bsc"
        ? {
            native: ["BNB"],
            token_mode: !tokenScanEnabled ? "disabled" : allowTokenScanAll ? "all_enabled" : "allowlist",
            token_symbols: tokenScanEnabled && !allowTokenScanAll ? allowlistedSymbols : ([] as string[]),
          }
        : {
            native: ["ETH"],
            token_mode: "disabled" as const,
            token_symbols: [] as string[],
          };

    const response = Response.json({
      address,
      chain,
      is_new: isNew,
      supported,
    });

    logRouteResponse(request, response, { startMs, meta: { userId, isNew, chain } });
    return response;
  } catch (e) {
    const resp = responseForDbError("exchange.deposit.address", e);
    if (resp) return resp;
    throw e;
  }
}
