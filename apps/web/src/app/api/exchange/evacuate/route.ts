import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError } from "@/lib/api/errors";
import { decryptCredential } from "@/lib/auth/credentials";
import { getAuthenticatedExchangeClientWithType } from "@/lib/exchange/externalApis";
import { getOrCreateDepositAddress } from "@/lib/blockchain/wallet";
import { auditContextFromRequest, writeAuditLog } from "@/lib/auditLog";
import { responseForDbError } from "@/lib/dbTransient";

// Evacuate funds from connected exchanges (Binance, Bybit, etc) to the user's generated deposit address.
// Currently focused on USDT.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const { address: destinationAddress } = await getOrCreateDepositAddress(sql, actingUserId, "bsc");
    const network = "BSC"; // Always evacuate to BSC for the generated deposit address

    if (!destinationAddress) {
      return NextResponse.json({
        success: false,
        message: "Could not retrieve a deposit address for your account.",
      });
    }

    // 1. Get all active connections

    const connections = await sql<
      Array<{
        exchange: string;
        api_key_enc: string;
        api_secret_enc: string;
        passphrase_enc: string | null;
      }>
    >`
      SELECT exchange, api_key_enc, api_secret_enc, passphrase_enc
      FROM user_exchange_connection
      WHERE user_id = ${actingUserId}::uuid AND status = 'active'
    `;

    if (connections.length === 0) {
      return NextResponse.json({ message: "No active exchange connections found." });
    }

    const results: Array<{ exchange: string; amount: number; tx?: string; error?: string }> = [];

    // 2. Iterate and withdraw
    for (const conn of connections) {
      const exchangeId = conn.exchange;
      try {
        const apiKey = decryptCredential(conn.api_key_enc);
        const apiSecret = decryptCredential(conn.api_secret_enc);
        const passphrase = conn.passphrase_enc ? decryptCredential(conn.passphrase_enc) : undefined;

        // Use 'spot' for withdrawals usually.
        const client = getAuthenticatedExchangeClientWithType(
          exchangeId as any,
          { apiKey, apiSecret, passphrase },
          { defaultType: "spot" }
        ) as any;

        // Fetch USDT balance
        // Try fetchBalance() typical format
        const balance = await client.fetchBalance();
        const usdtFree = Number(balance?.USDT?.free);

        // Min withdrawal amount? Let's say 10 USDT to be safe + cover fees.
        // Some exchanges have higher mins.
        if (Number.isFinite(usdtFree) && usdtFree > 10) {
          // Attempt withdrawal
          // Common params for network: { network: 'TRX' } for Binance.
          // For generic CCXT:
          // client.withdraw(code, amount, address, tag, params)
          // Tag is usually undefined for USDT unless generic. For TRC20/ERC20 usually no tag.
          // BUT checks for memos are important. Usually destinationAddress handles it or user provides.
          // We assume standard external address.

          const withdrawParams = {
              network: network
          };

          // WARNING: This is a real withdrawal.
          const withdrawal = await client.withdraw(
              "USDT",
              usdtFree,
              destinationAddress,
              undefined, // tag
              withdrawParams
          );

          results.push({
            exchange: exchangeId,
            amount: usdtFree,
            tx: withdrawal?.id || "submitted",
          });
        } else {
            // Skipped
        }
      } catch (e: any) {
        results.push({
          exchange: exchangeId,
          amount: 0,
          error: e.message || String(e),
        });
      }
    }

    try {
      const auditCtx = auditContextFromRequest(request);
      await writeAuditLog(sql, {
        actorId: actingUserId,
        actorType: "user",
        action: "exchange.evacuate",
        resourceType: "exchange_connection",
        resourceId: "all",
        ip: auditCtx.ip,
        userAgent: auditCtx.userAgent,
        requestId: auditCtx.requestId,
        detail: {
          destination: destinationAddress,
          network,
          result_count: results.length,
          results,
        },
      });
    } catch (e) {
      // Never fail the user action due to audit logging.
      console.error("exchange.evacuate audit log failed:", e);
    }

    return NextResponse.json({
      success: true,
      message: "Evacuation attempt completed.",
      results
    });

  } catch (e) {
    const resp = responseForDbError("exchange.evacuate", e);
    if (resp) return resp;

    console.error("exchange.evacuate failed:", e);
    return NextResponse.json(
      {
        success: false,
        message: "Evacuation failed. Please try again in a moment.",
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 200 }
    );
  }
}
