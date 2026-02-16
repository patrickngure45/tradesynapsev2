import type { Sql } from "postgres";

import { decryptCredential } from "@/lib/auth/credentials";
import { getAuthenticatedExchangeClientWithType } from "@/lib/exchange/externalApis";

function toSpotSymbol(perpSymbol: string): string {
  return perpSymbol.includes(":") ? perpSymbol.split(":")[0]! : perpSymbol;
}

function toSafeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function nowIso() {
  return new Date().toISOString();
}

function getMode(params: unknown): "simulation" | "live" {
  if (params && typeof params === "object" && !Array.isArray(params)) {
    const m = (params as any).mode;
    if (m === "live") return "live";
  }
  return "simulation";
}

async function bestEffortFetchShortSize(swapClient: any, symbol: string): Promise<number | null> {
  try {
    if (typeof swapClient.fetchPosition === "function") {
      const pos = await swapClient.fetchPosition(symbol);
      const signed = toSafeNumber((pos as any)?.contracts ?? (pos as any)?.amount ?? (pos as any)?.info?.positionAmt);
      if (Number.isFinite(signed) && signed < 0) return Math.abs(signed);
      const side = String((pos as any)?.side ?? "").toLowerCase();
      const amt = toSafeNumber((pos as any)?.contracts ?? (pos as any)?.amount);
      if (side === "short" && Number.isFinite(amt) && amt > 0) return amt;
    }

    if (typeof swapClient.fetchPositions === "function") {
      const positions = await swapClient.fetchPositions([symbol]);
      const first = Array.isArray(positions) ? positions[0] : null;
      const signed = toSafeNumber((first as any)?.contracts ?? (first as any)?.amount ?? (first as any)?.info?.positionAmt);
      if (Number.isFinite(signed) && signed < 0) return Math.abs(signed);
      const side = String((first as any)?.side ?? "").toLowerCase();
      const amt = toSafeNumber((first as any)?.contracts ?? (first as any)?.amount);
      if (side === "short" && Number.isFinite(amt) && amt > 0) return amt;
    }
  } catch {
    // ignore
  }

  return null;
}

export async function handleTradingBotUnwind(sql: Sql, opts: { executionId: string }): Promise<void> {
  const executionId = opts.executionId;

  const [exec] = await sql<
    Array<{
      id: string;
      user_id: string;
      status: string;
      exchange: string | null;
      symbol: string | null;
      params_json: unknown;
      result_json: unknown;
    }>
  >`
    SELECT id, user_id, status, exchange, symbol, params_json, result_json
    FROM trading_bot_execution
    WHERE id = ${executionId}::uuid
    LIMIT 1
  `;

  if (!exec) return;

  // Only proceed if a stop was requested (or already unwinding).
  if (exec.status !== "cancel_requested" && exec.status !== "unwinding") {
    return;
  }

  // Mark as unwinding.
  if (exec.status !== "unwinding") {
    await sql`
      UPDATE trading_bot_execution
      SET status = 'unwinding', error = NULL,
          result_json = jsonb_set(result_json, '{unwind}', ${JSON.stringify({ at: nowIso(), stage: "starting" })}::jsonb, true)
      WHERE id = ${executionId}::uuid
    `;
  }

  const mode = getMode(exec.params_json);

  // For simulation, we can just cancel.
  if (mode === "simulation") {
    await sql`
      UPDATE trading_bot_execution
      SET status = 'canceled', finished_at = now(), error = NULL,
          result_json = jsonb_set(result_json, '{unwind}', ${JSON.stringify({ at: nowIso(), stage: "done", note: "Simulation canceled." })}::jsonb, true)
      WHERE id = ${executionId}::uuid
    `;
    return;
  }

  const exchange = String(exec.exchange ?? "").toLowerCase();
  const perpSymbol = String(exec.symbol ?? "");
  const spotSymbol = toSpotSymbol(perpSymbol);

  if (!exchange || !perpSymbol) {
    await sql`
      UPDATE trading_bot_execution
      SET status = 'failed', finished_at = now(),
          error = 'Unwind failed: missing exchange or symbol on execution.',
          result_json = jsonb_set(result_json, '{unwind}', ${JSON.stringify({ at: nowIso(), stage: "failed", note: "No orders were placed." })}::jsonb, true)
      WHERE id = ${executionId}::uuid
    `;
    return;
  }

  if (exchange !== "binance") {
    await sql`
      UPDATE trading_bot_execution
      SET status = 'failed', finished_at = now(),
          error = ${`Unwind is only implemented for Binance right now (got ${exchange}).`},
          result_json = jsonb_set(result_json, '{unwind}', ${JSON.stringify({ at: nowIso(), stage: "failed" })}::jsonb, true)
      WHERE id = ${executionId}::uuid
    `;
    return;
  }

  const [connection] = await sql<
    Array<{ api_key_enc: string; api_secret_enc: string; passphrase_enc: string | null }>
  >`
    SELECT api_key_enc, api_secret_enc, passphrase_enc
    FROM user_exchange_connection
    WHERE user_id = ${exec.user_id}::uuid
      AND exchange = ${exchange}
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (!connection) {
    await sql`
      UPDATE trading_bot_execution
      SET status = 'failed', finished_at = now(),
          error = ${`Unwind failed: no active ${exchange} connection.`},
          result_json = jsonb_set(result_json, '{unwind}', ${JSON.stringify({ at: nowIso(), stage: "failed", note: "Manual intervention may be required." })}::jsonb, true)
      WHERE id = ${executionId}::uuid
    `;
    return;
  }

  const apiKey = decryptCredential(connection.api_key_enc);
  const apiSecret = decryptCredential(connection.api_secret_enc);
  const passphrase = connection.passphrase_enc ? decryptCredential(connection.passphrase_enc) : undefined;

  const spotClient = getAuthenticatedExchangeClientWithType(
    "binance",
    { apiKey, apiSecret, passphrase },
    { defaultType: "spot" },
  ) as any;
  const swapClient = getAuthenticatedExchangeClientWithType(
    "binance",
    { apiKey, apiSecret, passphrase },
    { defaultType: "swap" },
  ) as any;

  let closePerpOrder: any = null;
  let sellSpotOrder: any = null;
  const warnings: string[] = [];

  try {
    if (typeof spotClient.loadMarkets === "function") await spotClient.loadMarkets();
    if (typeof swapClient.loadMarkets === "function") await swapClient.loadMarkets();

    const r: any = exec.result_json && typeof exec.result_json === "object" ? exec.result_json : {};

    // Determine the quantity to close.
    const qtyFromExec = toSafeNumber(r?.perpOrder?.filled ?? r?.perpOrder?.amount);
    const qtyFromPos = await bestEffortFetchShortSize(swapClient, perpSymbol);
    const qtyToClose = (typeof qtyFromPos === "number" && Number.isFinite(qtyFromPos) && qtyFromPos > 0)
      ? qtyFromPos
      : (Number.isFinite(qtyFromExec) && qtyFromExec > 0)
        ? qtyFromExec
        : NaN;

    if (Number.isFinite(qtyToClose) && qtyToClose > 0) {
      closePerpOrder = await swapClient.createOrder(perpSymbol, "market", "buy", qtyToClose, undefined, {
        reduceOnly: true,
      });
    } else {
      warnings.push("Could not determine perp position size; skipped perp close.");
    }

    // Spot unwind: only sell up to the spot qty this execution likely bought.
    const base = spotSymbol.split("/")[0] ?? "";
    const spotBalance = await spotClient.fetchBalance();
    const baseFree = toSafeNumber(spotBalance?.[base]?.free ?? 0);
    const boughtQty = toSafeNumber(r?.spotOrder?.filled ?? r?.spotOrder?.amount);

    if (!base) {
      warnings.push("Could not determine spot base asset; skipped spot sell.");
    } else if (!Number.isFinite(baseFree) || baseFree <= 0) {
      warnings.push(`No free ${base} balance found; skipped spot sell.`);
    } else if (!Number.isFinite(boughtQty) || boughtQty <= 0) {
      warnings.push("Missing executed spot qty; skipped spot sell to avoid liquidating unrelated holdings.");
    } else {
      const qtyToSell = Math.min(baseFree, boughtQty);
      if (qtyToSell > 0) {
        sellSpotOrder = await spotClient.createOrder(spotSymbol, "market", "sell", qtyToSell);
      } else {
        warnings.push("Computed spot sell qty was 0; skipped.");
      }
    }

    await sql`
      UPDATE trading_bot_execution
      SET status = 'canceled', finished_at = now(), error = NULL,
          result_json = jsonb_set(
            result_json,
            '{unwind}',
            ${JSON.stringify({
              at: nowIso(),
              stage: "done",
              exchange,
              symbol: perpSymbol,
              spotSymbol,
              closePerpOrder: closePerpOrder
                ? { id: closePerpOrder?.id ?? closePerpOrder?.orderId, status: closePerpOrder?.status, filled: closePerpOrder?.filled, amount: closePerpOrder?.amount }
                : null,
              sellSpotOrder: sellSpotOrder
                ? { id: sellSpotOrder?.id ?? sellSpotOrder?.orderId, status: sellSpotOrder?.status, filled: sellSpotOrder?.filled, amount: sellSpotOrder?.amount }
                : null,
              warnings,
            })}::jsonb,
            true
          )
      WHERE id = ${executionId}::uuid
    `;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);

    await sql`
      UPDATE trading_bot_execution
      SET status = 'failed', finished_at = now(),
          error = ${`Unwind failed: ${errMsg}`},
          result_json = jsonb_set(result_json, '{unwind}', ${JSON.stringify({ at: nowIso(), stage: "failed", error: errMsg, warnings })}::jsonb, true)
      WHERE id = ${executionId}::uuid
    `;
  }
}
