import type { Sql } from "postgres";

import { decryptCredential } from "@/lib/auth/credentials";
import { getAuthenticatedExchangeClientWithType } from "@/lib/exchange/externalApis";

function liveTradingEnabled(): boolean {
  return process.env.TRADING_LIVE_ENABLED === "1";
}

function liveAllowedExchanges(): Set<string> {
  const raw = process.env.TRADING_LIVE_ALLOWED_EXCHANGES ?? "";
  const parts = raw
    .split(/[,\n]/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set(parts);
}

function toSpotSymbol(perpSymbol: string): string {
  // Funding scanner emits CCXT perp symbols like "BTC/USDT:USDT".
  return perpSymbol.includes(":") ? perpSymbol.split(":")[0]! : perpSymbol;
}

function toSafeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
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

export async function handleTradingBotExecution(sql: Sql, opts: { executionId: string }): Promise<void> {
  const executionId = opts.executionId;

  const [exec] = await sql<
    Array<{
      id: string;
      user_id: string;
      kind: string;
      status: string;
      signal_id: string | null;
      exchange: string | null;
      symbol: string | null;
      amount_usd: string | null;
      leverage: string | null;
      params_json: unknown;
      result_json: unknown;
    }>
  >`
    SELECT id, user_id, kind, status, signal_id, exchange, symbol, amount_usd::text, leverage::text, params_json, result_json
    FROM trading_bot_execution
    WHERE id = ${executionId}::uuid
    LIMIT 1
  `;

  if (!exec) return;
  if (exec.status !== "queued") return;

  await sql`
    UPDATE trading_bot_execution
    SET status = 'running', started_at = now(), error = NULL
    WHERE id = ${executionId}::uuid
  `;

  try {
    const requestedMode = getMode(exec.params_json);
    if (requestedMode === "live") {
      if (!liveTradingEnabled()) {
        await sql`
          UPDATE trading_bot_execution
          SET status = 'failed', finished_at = now(), error = 'Live trading requested but TRADING_LIVE_ENABLED is not set.',
              result_json = ${JSON.stringify({ mode: requestedMode, note: "No orders were placed." })}::jsonb
          WHERE id = ${executionId}::uuid
        `;
        return;
      }
    }

    const exchange = String(exec.exchange ?? "");
    const symbol = String(exec.symbol ?? "");
    const amountUsd = Number(exec.amount_usd ?? "0");

    if (!exchange) {
      throw new Error("Missing exchange on execution");
    }

    const [connection] = await sql<
      Array<{
        api_key_enc: string;
        api_secret_enc: string;
        passphrase_enc: string | null;
      }>
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
        SET status = 'failed', finished_at = now(), error = ${`No active ${exchange} connection`}
        WHERE id = ${executionId}::uuid
      `;
      return;
    }

    const apiKey = decryptCredential(connection.api_key_enc);
    const apiSecret = decryptCredential(connection.api_secret_enc);
    const passphrase = connection.passphrase_enc ? decryptCredential(connection.passphrase_enc) : undefined;

    // Always run basic balance checks.
    const spotClientAny = getAuthenticatedExchangeClientWithType(exchange as any, { apiKey, apiSecret, passphrase }, { defaultType: "spot" }) as any;
    const balance = await spotClientAny.fetchBalance();
    const usdtFree = toSafeNumber(balance?.USDT?.free ?? 0);

    if (amountUsd > 0 && (!Number.isFinite(usdtFree) || usdtFree < amountUsd)) {
      await sql`
        UPDATE trading_bot_execution
        SET
          status = 'failed',
          finished_at = now(),
          error = ${`Insufficient USDT balance (free=${usdtFree}, required=${amountUsd})`},
          result_json = ${JSON.stringify({
            mode: "simulation",
            checks: { usdtFree, requiredUsd: amountUsd },
            exchange,
            symbol,
          })}::jsonb
        WHERE id = ${executionId}::uuid
      `;
      return;
    }

    const mode = requestedMode;
    if (mode === "simulation") {
      await sql`
        UPDATE trading_bot_execution
        SET
          status = 'succeeded',
          finished_at = now(),
          error = NULL,
          result_json = ${JSON.stringify({
            mode: "simulation",
            checks: { usdtFree, requiredUsd: amountUsd },
            exchange,
            symbol,
            note: "Simulation-only: no orders were placed.",
          })}::jsonb
        WHERE id = ${executionId}::uuid
      `;
      return;
    }

    // Live execution (currently Binance-only).
    const allowed = liveAllowedExchanges();
    if (allowed.size > 0 && !allowed.has(exchange.toLowerCase())) {
      await sql`
        UPDATE trading_bot_execution
        SET status = 'failed', finished_at = now(), error = ${`Live trading not allowed for exchange=${exchange}`},
            result_json = ${JSON.stringify({ mode, exchange, note: "No orders were placed." })}::jsonb
        WHERE id = ${executionId}::uuid
      `;
      return;
    }

    if (exchange.toLowerCase() !== "binance") {
      await sql`
        UPDATE trading_bot_execution
        SET status = 'failed', finished_at = now(), error = ${`Live trading is only implemented for Binance right now (got ${exchange}).`},
            result_json = ${JSON.stringify({ mode, exchange, note: "No orders were placed." })}::jsonb
        WHERE id = ${executionId}::uuid
      `;
      return;
    }

    if (!symbol) {
      throw new Error("Missing symbol on execution");
    }

    const leverage = Math.max(1, Math.min(10, Number(exec.leverage ?? "1") || 1));
    const legUsd = amountUsd > 0 ? amountUsd / 2 : 0;
    if (legUsd <= 0) throw new Error("Invalid amount_usd");

    const spotSymbol = toSpotSymbol(symbol);
    const perpSymbol = symbol;

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

    let spotOrder: any = null;
    let perpOrder: any = null;
    let unwindOrder: any = null;

    try {
      // Ensure market metadata is available for precision helpers.
      if (typeof spotClient.loadMarkets === "function") await spotClient.loadMarkets();
      if (typeof swapClient.loadMarkets === "function") await swapClient.loadMarkets();

      // ── Preflight checks (fail-fast before placing any orders) ──
      const maxSignalAgeMin = Math.max(1, Math.floor(envNumber("TRADING_SIGNAL_MAX_AGE_MIN", 30)));
      const maxBasisPct = Math.max(0, envNumber("TRADING_MAX_ENTRY_BASIS_PCT", 1.0));

      let signalInfo: any = null;
      if (exec.signal_id) {
        const [sig] = await sql`
          SELECT id, kind, payload_json, created_at
          FROM app_signal
          WHERE id = ${exec.signal_id}::uuid
          LIMIT 1
        `;
        if (sig) {
          const createdAt = new Date(sig.created_at as any);
          const ageMin = (Date.now() - createdAt.getTime()) / 60000;
          signalInfo = {
            id: String(sig.id),
            kind: String(sig.kind),
            createdAt: createdAt.toISOString(),
            ageMin: Number.isFinite(ageMin) ? Number(ageMin.toFixed(2)) : null,
            exchange: (sig.payload_json as any)?.exchange,
            symbol: (sig.payload_json as any)?.symbol,
            fundingRate: (sig.payload_json as any)?.fundingRate,
          };

          if (Number.isFinite(ageMin) && ageMin > maxSignalAgeMin) {
            await sql`
              UPDATE trading_bot_execution
              SET status = 'failed', finished_at = now(),
                  error = ${`Signal too old (${ageMin.toFixed(1)} min > ${maxSignalAgeMin} min). Re-scan funding rates.`},
                  result_json = ${JSON.stringify({
                    mode: "live",
                    exchange,
                    symbol: perpSymbol,
                    spotSymbol,
                    leverage,
                    legUsd,
                    preflight: { at: nowIso(), maxSignalAgeMin, maxBasisPct, signal: signalInfo },
                    note: "No orders were placed.",
                  })}::jsonb
              WHERE id = ${executionId}::uuid
            `;
            return;
          }

          const sigFundingRate = toSafeNumber(signalInfo.fundingRate);
          if (Number.isFinite(sigFundingRate) && sigFundingRate <= 0) {
            await sql`
              UPDATE trading_bot_execution
              SET status = 'failed', finished_at = now(),
                  error = 'Funding is not positive; cash & carry is not eligible right now.',
                  result_json = ${JSON.stringify({
                    mode: "live",
                    exchange,
                    symbol: perpSymbol,
                    spotSymbol,
                    leverage,
                    legUsd,
                    preflight: { at: nowIso(), maxSignalAgeMin, maxBasisPct, signal: signalInfo },
                    note: "No orders were placed.",
                  })}::jsonb
              WHERE id = ${executionId}::uuid
            `;
            return;
          }
        }
      }

      // Market limits + basis check
      const spotTicker = await spotClient.fetchTicker(spotSymbol);
      const swapTicker = await swapClient.fetchTicker(perpSymbol);
      const spotAsk = toSafeNumber(spotTicker?.ask ?? spotTicker?.last);
      const perpBid = toSafeNumber(swapTicker?.bid ?? swapTicker?.last);
      const basisPct = Number.isFinite(spotAsk) && spotAsk > 0 && Number.isFinite(perpBid)
        ? ((perpBid / spotAsk) - 1) * 100
        : NaN;

      const spotMarket = spotClient?.markets?.[spotSymbol];
      const swapMarket = swapClient?.markets?.[perpSymbol];
      const spotMinCost = toSafeNumber(spotMarket?.limits?.cost?.min);
      const spotMinAmount = toSafeNumber(spotMarket?.limits?.amount?.min);
      const swapMinAmount = toSafeNumber(swapMarket?.limits?.amount?.min);

      const expectedQty = Number.isFinite(spotAsk) && spotAsk > 0 ? (legUsd / spotAsk) : NaN;
      const expectedQtyPrec =
        Number.isFinite(expectedQty) && typeof spotClient.amountToPrecision === "function"
          ? toSafeNumber(spotClient.amountToPrecision(spotSymbol, expectedQty))
          : expectedQty;

      const preflight = {
        at: nowIso(),
        maxSignalAgeMin,
        maxBasisPct,
        prices: {
          spotAsk,
          perpBid,
          basisPct,
        },
        limits: {
          spotMinCost: Number.isFinite(spotMinCost) ? spotMinCost : null,
          spotMinAmount: Number.isFinite(spotMinAmount) ? spotMinAmount : null,
          swapMinAmount: Number.isFinite(swapMinAmount) ? swapMinAmount : null,
        },
        sizing: {
          legUsd,
          expectedQty: expectedQtyPrec,
        },
        signal: signalInfo,
      };

      if (!Number.isFinite(spotAsk) || spotAsk <= 0) {
        await sql`
          UPDATE trading_bot_execution
          SET status = 'failed', finished_at = now(),
              error = 'Preflight failed: could not fetch spot ask price.',
              result_json = ${JSON.stringify({ mode: "live", exchange, symbol: perpSymbol, spotSymbol, leverage, legUsd, preflight, note: "No orders were placed." })}::jsonb
          WHERE id = ${executionId}::uuid
        `;
        return;
      }

      if (Number.isFinite(spotMinCost) && legUsd < spotMinCost) {
        await sql`
          UPDATE trading_bot_execution
          SET status = 'failed', finished_at = now(),
              error = ${`Preflight failed: leg USD amount below min notional (legUsd=${legUsd}, minCost=${spotMinCost}).`},
              result_json = ${JSON.stringify({ mode: "live", exchange, symbol: perpSymbol, spotSymbol, leverage, legUsd, preflight, note: "No orders were placed." })}::jsonb
          WHERE id = ${executionId}::uuid
        `;
        return;
      }

      if (Number.isFinite(spotMinAmount) && Number.isFinite(expectedQtyPrec) && expectedQtyPrec > 0 && expectedQtyPrec < spotMinAmount) {
        await sql`
          UPDATE trading_bot_execution
          SET status = 'failed', finished_at = now(),
              error = ${`Preflight failed: spot qty below min (qty=${expectedQtyPrec}, min=${spotMinAmount}).`},
              result_json = ${JSON.stringify({ mode: "live", exchange, symbol: perpSymbol, spotSymbol, leverage, legUsd, preflight, note: "No orders were placed." })}::jsonb
          WHERE id = ${executionId}::uuid
        `;
        return;
      }

      if (Number.isFinite(swapMinAmount) && Number.isFinite(expectedQtyPrec) && expectedQtyPrec > 0 && expectedQtyPrec < swapMinAmount) {
        await sql`
          UPDATE trading_bot_execution
          SET status = 'failed', finished_at = now(),
              error = ${`Preflight failed: perp qty below min (qty=${expectedQtyPrec}, min=${swapMinAmount}).`},
              result_json = ${JSON.stringify({ mode: "live", exchange, symbol: perpSymbol, spotSymbol, leverage, legUsd, preflight, note: "No orders were placed." })}::jsonb
          WHERE id = ${executionId}::uuid
        `;
        return;
      }

      if (Number.isFinite(basisPct) && basisPct > maxBasisPct) {
        await sql`
          UPDATE trading_bot_execution
          SET status = 'failed', finished_at = now(),
              error = ${`Preflight failed: perp premium too high (basis=${basisPct.toFixed(3)}% > max=${maxBasisPct}%).`},
              result_json = ${JSON.stringify({ mode: "live", exchange, symbol: perpSymbol, spotSymbol, leverage, legUsd, preflight, note: "No orders were placed." })}::jsonb
          WHERE id = ${executionId}::uuid
        `;
        return;
      }

      // (1) Spot market buy for ~legUsd USDT.
      let baseQty: number | null = null;
      try {
        // Binance spot supports quoteOrderQty.
        spotOrder = await spotClient.createOrder(spotSymbol, "market", "buy", undefined, undefined, {
          quoteOrderQty: legUsd,
        });
      } catch (e) {
        // Fallback: compute base qty using ask price.
        const t = await spotClient.fetchTicker(spotSymbol);
        const ask = toSafeNumber(t?.ask ?? t?.last);
        if (!Number.isFinite(ask) || ask <= 0) throw e;
        baseQty = legUsd / ask;
        if (typeof spotClient.amountToPrecision === "function") {
          baseQty = Number(spotClient.amountToPrecision(spotSymbol, baseQty));
        }
        spotOrder = await spotClient.createOrder(spotSymbol, "market", "buy", baseQty);
      }

      const filledSpot = toSafeNumber(spotOrder?.filled ?? NaN);
      const amountSpot = toSafeNumber(spotOrder?.amount ?? NaN);
      const qty = Number.isFinite(filledSpot) && filledSpot > 0
        ? filledSpot
        : Number.isFinite(amountSpot) && amountSpot > 0
          ? amountSpot
          : baseQty ?? NaN;

      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error("Spot order did not return a filled/amount quantity");
      }

      // (2) Perp short (swap) for the same base qty (1x hedge).
      if (typeof swapClient.setMarginMode === "function") {
        // Prefer isolated for safety; if unsupported, ignore.
        try { await swapClient.setMarginMode("isolated", perpSymbol); } catch { /* ignore */ }
      }
      if (typeof swapClient.setLeverage === "function") {
        try { await swapClient.setLeverage(leverage, perpSymbol); } catch { /* ignore */ }
      }

      perpOrder = await swapClient.createOrder(perpSymbol, "market", "sell", qty, undefined, {
        reduceOnly: false,
      });

      await sql`
        UPDATE trading_bot_execution
        SET
          status = 'succeeded',
          finished_at = now(),
          error = NULL,
          result_json = ${JSON.stringify({
            mode: "live",
            exchange,
            symbol: perpSymbol,
            spotSymbol,
            leverage,
            legUsd,
            preflight,
            checks: { usdtFree, requiredUsd: amountUsd },
            spotOrder: {
              id: spotOrder?.id ?? spotOrder?.orderId,
              filled: spotOrder?.filled,
              amount: spotOrder?.amount,
              cost: spotOrder?.cost,
              status: spotOrder?.status,
            },
            perpOrder: {
              id: perpOrder?.id ?? perpOrder?.orderId,
              filled: perpOrder?.filled,
              amount: perpOrder?.amount,
              cost: perpOrder?.cost,
              status: perpOrder?.status,
            },
            note: "Live execution placed 2 market orders (spot buy + perp sell).",
          })}::jsonb
        WHERE id = ${executionId}::uuid
      `;
    } catch (e) {
      // Best-effort unwind if we bought spot but couldn't short perps.
      const errMsg = e instanceof Error ? e.message : String(e);
      try {
        if (spotOrder && !perpOrder) {
          const qty = toSafeNumber(spotOrder?.filled ?? spotOrder?.amount ?? NaN);
          if (Number.isFinite(qty) && qty > 0) {
            unwindOrder = await spotClient.createOrder(spotSymbol, "market", "sell", qty);
          }
        }
      } catch {
        // ignore unwind failures
      }

      await sql`
        UPDATE trading_bot_execution
        SET
          status = 'failed',
          finished_at = now(),
          error = ${errMsg},
          result_json = ${JSON.stringify({
            mode: "live",
            exchange,
            symbol: perpSymbol,
            spotSymbol,
            leverage,
            legUsd,
            spotOrder: spotOrder ? { id: spotOrder?.id ?? spotOrder?.orderId, status: spotOrder?.status } : null,
            perpOrder: perpOrder ? { id: perpOrder?.id ?? perpOrder?.orderId, status: perpOrder?.status } : null,
            unwindOrder: unwindOrder ? { id: unwindOrder?.id ?? unwindOrder?.orderId, status: unwindOrder?.status } : null,
            note: spotOrder && !perpOrder ? "Perp leg failed; attempted best-effort spot unwind." : "Execution failed.",
          })}::jsonb
        WHERE id = ${executionId}::uuid
      `;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await sql`
      UPDATE trading_bot_execution
      SET status = 'failed', finished_at = now(), error = ${message}
      WHERE id = ${executionId}::uuid
    `;
  }
}
