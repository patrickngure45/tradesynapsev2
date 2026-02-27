
import { z } from "zod";

import { NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { responseForDbError } from "@/lib/dbTransient";
import { decryptCredential } from "@/lib/auth/credentials";
import { createNotification } from "@/lib/notifications";
import { chargeGasFee } from "@/lib/exchange/gas";
import {
    getAuthenticatedTradingFee,
    getExchangeBalances,
    getExchangeMarketConstraints,
    getExchangeTicker,
    placeExchangeOrder,
    type ExchangeCredentials,
    type SupportedExchange,
} from "@/lib/exchange/externalApis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_SETTLEMENT_USER_ID = "00000000-0000-0000-0000-000000000001";

function numEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    const v = raw ? Number(raw) : NaN;
    return Number.isFinite(v) ? v : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
    const raw = process.env[name];
    if (raw == null) return fallback;
    const v = raw.trim().toLowerCase();
    if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
    if (v === "0" || v === "false" || v === "no" || v === "off") return false;
    return fallback;
}

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

function floorToPrecision(value: number, precisionDigits: number): number {
    if (!Number.isFinite(value)) return 0;
    const p = Math.max(0, Math.min(18, Math.floor(precisionDigits)));
    const m = 10 ** p;
    return Math.floor(value * m) / m;
}

function hashUnit(input: string): number {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
}

async function getUserAvailableAsset(sql: ReturnType<typeof getSql>, userId: string, symbol: string): Promise<number> {
    const rows = await sql<{ available: string | null }[]>`
        WITH asset AS (
            SELECT id
            FROM ex_asset
            WHERE chain = 'bsc' AND symbol = ${symbol} AND is_enabled = true
            LIMIT 1
        ),
        acct AS (
            SELECT id
            FROM ex_ledger_account
            WHERE user_id = ${userId}::uuid
                AND asset_id = (SELECT id FROM asset)
            LIMIT 1
        ),
        posted AS (
            SELECT coalesce(sum(amount), 0)::numeric AS posted
            FROM ex_journal_line
            WHERE account_id = (SELECT id FROM acct)
        ),
        held AS (
            SELECT coalesce(sum(remaining_amount), 0)::numeric AS held
            FROM ex_hold
            WHERE account_id = (SELECT id FROM acct)
                AND status = 'active'
        )
        SELECT (posted.posted - held.held)::text AS available
        FROM posted, held
    `;

    const v = Number(rows[0]?.available ?? "0");
    return Number.isFinite(v) && v > 0 ? v : 0;
}

const schema = z.object({
    opp: z.object({
        symbol: z.string().trim().min(1),
        buyExchange: z.string().trim().min(1),
        sellExchange: z.string().trim().min(1),
        buyAsk: z.coerce.number().positive(),
        sellBid: z.coerce.number().positive(),
    }),
});

export async function POST(req: Request) {
  const sql = getSql();
    const actingUserId = getActingUserId(req);
    const authErr = requireActingUserIdInProd(actingUserId);
    if (authErr) return NextResponse.json({ error: authErr }, { status: 401 });
    if (!actingUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const internalSettlementEnabled = envBool("ARB_INTERNAL_SETTLEMENT_ENABLED", true);

        // Safety: disable external auto-trade unless explicitly enabled.
        if (!internalSettlementEnabled && process.env.ARB_AUTOTRADE_ENABLED !== "1") {
            return NextResponse.json(
                {
                    error: "autotrade_disabled",
                    message: "Auto-trade is currently disabled. The arbitrage page is scanner-only until enabled by the operator.",
                },
                { status: 403 },
            );
        }

    try {
        const activeErr = await requireActiveUser(sql, actingUserId);
        if (activeErr) return NextResponse.json({ error: activeErr }, { status: 403 });

        const parsed = schema.safeParse(await req.json().catch(() => ({})));
        if (!parsed.success) {
            return NextResponse.json({ error: "invalid_input", detail: parsed.error.flatten() }, { status: 400 });
        }

        const opp = parsed.data.opp;
        const buyExchange = opp.buyExchange.toLowerCase();
        const sellExchange = opp.sellExchange.toLowerCase();

        const isInternalBuy = buyExchange === "tradesynapse";
        const isInternalSell = sellExchange === "tradesynapse";

                const settlementMode: "internal" | "external" = internalSettlementEnabled ? "internal" : "external";

                // Trading support is currently limited in externalApis.placeExchangeOrder.
                const supportedExternal = new Set<SupportedExchange>(["binance", "bybit"]);
        if (!isInternalBuy && !supportedExternal.has(buyExchange as SupportedExchange) && settlementMode === "external") {
            return NextResponse.json({ error: `unsupported_buy_exchange:${buyExchange}` }, { status: 400 });
        }
        if (!isInternalSell && !supportedExternal.has(sellExchange as SupportedExchange) && settlementMode === "external") {
            return NextResponse.json({ error: `unsupported_sell_exchange:${sellExchange}` }, { status: 400 });
        }

                const exchangesToFetch = settlementMode === "internal"
                        ? []
                        : [
            ...(isInternalBuy ? [] : [buyExchange]),
            ...(isInternalSell ? [] : [sellExchange]),
                    ];

        const rows = exchangesToFetch.length
            ? await sql<
                    {
                        exchange: string;
                        api_key_enc: string;
                        api_secret_enc: string;
                        passphrase_enc: string | null;
                        created_at: string;
                    }[]
                >`
                    SELECT exchange, api_key_enc, api_secret_enc, passphrase_enc, created_at
                    FROM user_exchange_connection
                    WHERE user_id = ${actingUserId}
                        AND status = 'active'
                        AND exchange IN (${sql(exchangesToFetch)})
                    ORDER BY created_at DESC
                `
            : [];

        const getConn = (exchange: string): ExchangeCredentials | null => {
            const r = rows.find((x) => x.exchange === exchange);
            if (!r) return null;
            return {
                apiKey: decryptCredential(r.api_key_enc),
                apiSecret: decryptCredential(r.api_secret_enc),
                passphrase: r.passphrase_enc ? decryptCredential(r.passphrase_enc) : undefined,
            };
        };

        const buyConn = isInternalBuy ? null : getConn(buyExchange);
        const sellConn = isInternalSell ? null : getConn(sellExchange);

        if (settlementMode === "external" && !isInternalBuy && !buyConn) {
            return NextResponse.json({ error: `missing_connection:${buyExchange}` }, { status: 400 });
        }
        if (settlementMode === "external" && !isInternalSell && !sellConn) {
            return NextResponse.json({ error: `missing_connection:${sellExchange}` }, { status: 400 });
        }

                const results: {
                    buy: unknown;
                    sell: unknown;
                    quote?: unknown;
                    sizing?: unknown;
                    constraints?: unknown;
                    balances?: unknown;
                    fees?: unknown;
                } = { buy: null, sell: null };
                const minUsd = clamp(numEnv("ARB_MIN_NOTIONAL_USD", 25), 5, 500);
                const maxUsdHardCap = clamp(numEnv("ARB_NOTIONAL_USD_CAP", 1000), minUsd, 100_000);
                const notionalUsdTarget = clamp(numEnv("ARB_NOTIONAL_USD", minUsd), minUsd, maxUsdHardCap);
                const userUsdt = await getUserAvailableAsset(sql, actingUserId, "USDT");

                if (settlementMode === "internal" && userUsdt + 1e-9 < minUsd) {
                    return NextResponse.json(
                        {
                            error: "insufficient_usdt",
                            message: `Deposit/hold at least $${minUsd.toFixed(2)} USDT to unlock auto-trade.`,
                            requiredUsd: minUsd,
                            availableUsdt: userUsdt,
                        },
                        { status: 403 },
                    );
                }

                // Re-quote at execution time to avoid stale client numbers.
                const [buyT, sellT] = await Promise.all([
                    getExchangeTicker(buyExchange as SupportedExchange, opp.symbol),
                    getExchangeTicker(sellExchange as SupportedExchange, opp.symbol),
                ]);

                const currentBuyAsk = Number.parseFloat(String(buyT.ask));
                const currentSellBid = Number.parseFloat(String(sellT.bid));

                if (!Number.isFinite(currentBuyAsk) || !Number.isFinite(currentSellBid) || currentBuyAsk <= 0 || currentSellBid <= 0) {
                    return NextResponse.json(
                        { error: "quote_unavailable", message: "Could not fetch executable bid/ask for this symbol right now." },
                        { status: 502 },
                    );
                }

                const maxDriftPct = Math.max(0, numEnv("ARB_MAX_PRICE_DRIFT_PCT", 0.25)); // 0.25% default
                const driftBuy = ((currentBuyAsk - opp.buyAsk) / opp.buyAsk) * 100;
                const driftSell = ((opp.sellBid - currentSellBid) / opp.sellBid) * 100;
                if (Number.isFinite(driftBuy) && driftBuy > maxDriftPct) {
                    return NextResponse.json(
                        {
                            error: "stale_price",
                            message: `Buy price moved by ${driftBuy.toFixed(3)}% (limit ${maxDriftPct}%). Re-scan and try again.`,
                            quote: { buyAsk: currentBuyAsk, sellBid: currentSellBid, ts: new Date().toISOString() },
                        },
                        { status: 409 },
                    );
                }
                if (Number.isFinite(driftSell) && driftSell > maxDriftPct) {
                    return NextResponse.json(
                        {
                            error: "stale_price",
                            message: `Sell price moved by ${driftSell.toFixed(3)}% (limit ${maxDriftPct}%). Re-scan and try again.`,
                            quote: { buyAsk: currentBuyAsk, sellBid: currentSellBid, ts: new Date().toISOString() },
                        },
                        { status: 409 },
                    );
                }

                if (settlementMode === "internal") {
                    const actionWindowSecs = clamp(numEnv("ARB_ACTION_WINDOW_SECS", 90), 15, 600);
                    const windowBucket = Math.floor(Date.now() / 1000 / actionWindowSecs);
                    const windowBaseChance = clamp(numEnv("ARB_ACTIONABLE_BASE_PCT", 18), 1, 95) / 100;

                    const defaultTakerFeeBpsPerLeg = Math.max(0, numEnv("ARB_TAKER_FEE_BPS", 10));
                    const feePct = (defaultTakerFeeBpsPerLeg * 2) / 100;
                    const latencyBps = Math.max(0, numEnv("ARB_LATENCY_BPS", 2));
                    const latencyPct = latencyBps / 100;
                    const grossSpreadPct = ((currentSellBid - currentBuyAsk) / currentBuyAsk) * 100;
                    const spreadBoost = Math.max(0, Math.min(0.45, (grossSpreadPct - 0.1) * 0.12));
                    const openChance = Math.min(0.9, windowBaseChance + spreadBoost);
                    const windowRoll = hashUnit(`${actingUserId}:${opp.symbol}:${buyExchange}:${sellExchange}:${windowBucket}`);
                    if (!(windowRoll < openChance)) {
                        return NextResponse.json(
                            {
                                error: "execution_window_closed",
                                message: "This opportunity is currently in cooldown. Keep scanning for the next actionable window.",
                            },
                            { status: 409 },
                        );
                    }

                    const uncertaintyBps = Math.max(0, numEnv("ARB_INTERNAL_UNCERTAINTY_BPS", 18));
                    const houseEdgeBps = Math.max(0, numEnv("ARB_INTERNAL_HOUSE_EDGE_BPS", 4));
                    const noiseRoll = hashUnit(`${actingUserId}:${opp.symbol}:${Date.now()}:${currentBuyAsk}:${currentSellBid}`);
                    const signedNoisePct = (((noiseRoll * 2) - 1) * uncertaintyBps) / 100;
                    const houseEdgePct = houseEdgeBps / 100;

                    const netSpreadPct = grossSpreadPct - feePct - latencyPct - houseEdgePct + signedNoisePct;
                    const minNetSpreadPct = numEnv("ARB_MIN_NET_SPREAD_PCT", 0.05);

                    if (!Number.isFinite(netSpreadPct) || netSpreadPct < minNetSpreadPct) {
                        return NextResponse.json(
                            {
                                error: "not_profitable",
                                message: `Net spread ${netSpreadPct.toFixed(3)}% below minimum ${minNetSpreadPct}% (fees+latency assumed ${(feePct + latencyPct).toFixed(3)}%).`,
                                quote: { buyAsk: currentBuyAsk, sellBid: currentSellBid, grossSpreadPct, netSpreadPct, ts: new Date().toISOString() },
                            },
                            { status: 409 },
                        );
                    }

                    const notionalUsdExec = notionalUsdTarget;
                    const pnlUsd = (netSpreadPct / 100) * notionalUsdExec;
                    const maxGainPct = clamp(numEnv("ARB_INTERNAL_MAX_GAIN_PCT", 0.75), 0.01, 10);
                    const maxLossPct = clamp(numEnv("ARB_INTERNAL_MAX_LOSS_PCT", 0.95), 0.01, 10);
                    const maxGainUsd = notionalUsdExec * (maxGainPct / 100);
                    const maxLossUsd = -notionalUsdExec * (maxLossPct / 100);
                    const pnlUsdClamped = Math.max(maxLossUsd, Math.min(maxGainUsd, pnlUsd));

                    if (userUsdt + pnlUsdClamped < 0) {
                        return NextResponse.json(
                            {
                                error: "insufficient_usdt_risk",
                                message: "This execution would overdraw your USDT balance.",
                                sizing: { userUsdt, pnlUsd: pnlUsdClamped, notionalUsdExec },
                            },
                            { status: 409 },
                        );
                    }

                    const settle = await sql.begin(async (tx) => {
                        const txSql = tx as unknown as ReturnType<typeof getSql>;

                        const gasErr = await chargeGasFee(txSql, {
                            userId: actingUserId,
                            action: "arbitrage_execute",
                            reference: opp.symbol,
                        });
                        if (gasErr) return { ok: false as const, error: gasErr.code, details: gasErr.details };

                        const usdtRows = await txSql<{ id: string }[]>`
                            SELECT id::text AS id
                            FROM ex_asset
                            WHERE chain = 'bsc' AND symbol = 'USDT' AND is_enabled = true
                            LIMIT 1
                        `;
                        const usdtAssetId = usdtRows[0]?.id;
                        if (!usdtAssetId) return { ok: false as const, error: "usdt_asset_not_found" };

                        const acctRows = await txSql<{ user_id: string; id: string }[]>`
                            INSERT INTO ex_ledger_account (user_id, asset_id)
                            VALUES
                                                            (${actingUserId}::uuid, ${usdtAssetId}::uuid),
                                                            (${SYSTEM_SETTLEMENT_USER_ID}::uuid, ${usdtAssetId}::uuid)
                            ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
                            RETURNING user_id::text AS user_id, id::text AS id
                        `;

                        const userAcct = acctRows.find((r) => r.user_id === actingUserId)?.id;
                        const sysAcct = acctRows.find((r) => r.user_id === SYSTEM_SETTLEMENT_USER_ID)?.id;
                        if (!userAcct || !sysAcct) return { ok: false as const, error: "usdt_accounts_not_found" };

                        const systemAvailBefore = await getUserAvailableAsset(txSql, SYSTEM_SETTLEMENT_USER_ID, "USDT");
                        if (pnlUsdClamped > 0 && systemAvailBefore + 1e-9 < pnlUsdClamped) {
                            return { ok: false as const, error: "settlement_pool_depleted" };
                        }

                        const entryRows = await txSql<{ id: string }[]>`
                            INSERT INTO ex_journal_entry (type, reference, metadata_json)
                            VALUES (
                              'arb_internal_settlement',
                              ${`${opp.symbol} ${buyExchange}->${sellExchange}`},
                              ${JSON.stringify({
                                symbol: opp.symbol,
                                buyExchange,
                                sellExchange,
                                buyAsk: currentBuyAsk,
                                sellBid: currentSellBid,
                                grossSpreadPct,
                                netSpreadPct,
                                notionalUsdExec,
                                                                pnlUsd: pnlUsdClamped,
                                mode: "internal",
                              })}::jsonb
                            )
                            RETURNING id::text AS id
                        `;
                        const entryId = entryRows[0]!.id;

                        await txSql`
                            INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
                            VALUES
                            (${entryId}::uuid, ${userAcct}::uuid, ${usdtAssetId}::uuid, (${pnlUsdClamped}::numeric)),
                            (${entryId}::uuid, ${sysAcct}::uuid, ${usdtAssetId}::uuid, ((${pnlUsdClamped}::numeric) * -1))
                        `;

                        const updatedUsdt = await getUserAvailableAsset(txSql, actingUserId, "USDT");
                        const systemAvailAfter = await getUserAvailableAsset(txSql, SYSTEM_SETTLEMENT_USER_ID, "USDT");

                        await createNotification(txSql, {
                            userId: actingUserId,
                            type: pnlUsdClamped >= 0 ? "trade_won" : "trade_lost",
                            title: pnlUsdClamped >= 0 ? "Arbitrage settled" : "Arbitrage settled (loss)",
                            body: `${opp.symbol} ${buyExchange}->${sellExchange} · ${pnlUsdClamped >= 0 ? "+" : ""}$${pnlUsdClamped.toFixed(2)} USDT`,
                            metadata: {
                                symbol: opp.symbol,
                                buyExchange,
                                sellExchange,
                                pnlUsd: pnlUsdClamped,
                                netSpreadPct,
                                mode: "internal",
                            },
                        });

                        return {
                            ok: true as const,
                            entryId,
                            updatedUsdt,
                            notionalUsdExec,
                            grossSpreadPct,
                            netSpreadPct,
                            pnlUsd: pnlUsdClamped,
                            systemAvailBefore,
                            systemAvailAfter,
                        };
                    });

                    if (!settle.ok) {
                        return NextResponse.json(
                            {
                                error: settle.error,
                                message: "Internal settlement failed.",
                                details: (settle as any).details,
                            },
                            { status: settle.error === "insufficient_gas" ? 409 : 500 },
                        );
                    }

                    return NextResponse.json({
                        success: true,
                        data: {
                            mode: "internal",
                            buy: { exchange: buyExchange, status: "quoted", price: currentBuyAsk },
                            sell: { exchange: sellExchange, status: "quoted", price: currentSellBid },
                            quote: {
                                buyAsk: currentBuyAsk,
                                sellBid: currentSellBid,
                                grossSpreadPct: settle.grossSpreadPct,
                                netSpreadPct: settle.netSpreadPct,
                                ts: new Date().toISOString(),
                            },
                            sizing: {
                                notionalUsdTarget,
                                notionalUsdExec: settle.notionalUsdExec,
                            },
                            settlement: {
                                entryId: settle.entryId,
                                pnlUsd: settle.pnlUsd,
                                model: {
                                    uncertaintyBps,
                                    houseEdgeBps,
                                    maxGainPct,
                                    maxLossPct,
                                },
                            },
                            balances: {
                                usdtAvailable: settle.updatedUsdt,
                                settlementPoolUsdt: settle.systemAvailAfter,
                            },
                        },
                    });
                }

                // Fetch constraints (auto-trade should be conservative).
                const requireConstraints = envBool("ARB_AUTOTRADE_REQUIRE_CONSTRAINTS", true);
                const [buyC, sellC] = await Promise.all([
                    getExchangeMarketConstraints(buyExchange as SupportedExchange, opp.symbol),
                    getExchangeMarketConstraints(sellExchange as SupportedExchange, opp.symbol),
                ]);
                results.constraints = { buy: buyC, sell: sellC };

                if (requireConstraints && (!buyC.ok || !sellC.ok)) {
                    return NextResponse.json(
                        {
                            error: "constraints_unavailable",
                            message: "Could not verify min/precision constraints for this symbol on one or both exchanges; auto-trade aborted.",
                            constraints: results.constraints,
                        },
                        { status: 409 },
                    );
                }

                // Balances: downsize to what is actually executable.
                const [buyBalances, sellBalances] = await Promise.all([
                    getExchangeBalances(buyExchange as SupportedExchange, buyConn!),
                    getExchangeBalances(sellExchange as SupportedExchange, sellConn!),
                ]);

                const buyUsdtFreeRaw = buyBalances.find((b) => String(b.asset).toUpperCase() === "USDT")?.free ?? 0;
                const buyUsdtFree = (() => {
                    const n = Number(buyUsdtFreeRaw);
                    return Number.isFinite(n) && n > 0 ? n : 0;
                })();
                const base = opp.symbol.toUpperCase().replace("USDT", "");
                const sellBaseFreeRaw = sellBalances.find((b) => String(b.asset).toUpperCase() === base)?.free ?? 0;
                const sellBaseFree = (() => {
                    const n = Number(sellBaseFreeRaw);
                    return Number.isFinite(n) && n > 0 ? n : 0;
                })();
                results.balances = {
                    buy: { exchange: buyExchange, usdtFree: buyUsdtFree },
                    sell: { exchange: sellExchange, base, baseFree: sellBaseFree },
                };

                const maxQtyByUsdt = currentBuyAsk > 0 ? buyUsdtFree / currentBuyAsk : 0;
                const qtyTarget = currentBuyAsk > 0 ? notionalUsdTarget / currentBuyAsk : 0;
                const maxQty = Math.max(0, Math.min(qtyTarget, maxQtyByUsdt, sellBaseFree));
                if (!(maxQty > 0)) {
                    return NextResponse.json(
                        {
                            error: "insufficient_balances",
                            message: "Not enough free balance on one or both exchanges to execute this opportunity.",
                            balances: results.balances,
                        },
                        { status: 409 },
                    );
                }

                // Apply precision + min constraints.
                const precisionFallback = Math.max(0, Math.floor(numEnv("ARB_AUTOTRADE_FALLBACK_QTY_PRECISION", 6)));
                const qtyPrecision =
                    buyC.ok && sellC.ok
                        ? Math.min(buyC.amountPrecision ?? precisionFallback, sellC.amountPrecision ?? precisionFallback)
                        : precisionFallback;
                let quantityNum = floorToPrecision(maxQty, qtyPrecision);

                const amountMin = buyC.ok && sellC.ok ? Math.max(buyC.amountMin ?? 0, sellC.amountMin ?? 0) : 0;
                if (amountMin > 0 && quantityNum < amountMin) {
                    return NextResponse.json(
                        {
                            error: "min_qty_not_met",
                            message: `Executable quantity ${quantityNum} is below minimum ${amountMin} on one or both venues.`,
                            constraints: results.constraints,
                            balances: results.balances,
                        },
                        { status: 409 },
                    );
                }

                const buyNotionalUsd = quantityNum * currentBuyAsk;
                const sellNotionalUsd = quantityNum * currentSellBid;
                const costMinBuy = buyC.ok ? buyC.costMin ?? 0 : 0;
                const costMinSell = sellC.ok ? sellC.costMin ?? 0 : 0;
                if ((costMinBuy > 0 && buyNotionalUsd < costMinBuy) || (costMinSell > 0 && sellNotionalUsd < costMinSell)) {
                    return NextResponse.json(
                        {
                            error: "min_notional_not_met",
                            message: "Executable notional is below the exchange minimum on one or both venues.",
                            detail: {
                                buyNotionalUsd,
                                sellNotionalUsd,
                                costMinBuy,
                                costMinSell,
                            },
                            constraints: results.constraints,
                        },
                        { status: 409 },
                    );
                }

                // Fee-aware profitability check (best-effort using authenticated fees).
                const [buyFee, sellFee] = await Promise.all([
                    getAuthenticatedTradingFee(buyExchange as SupportedExchange, buyConn!, opp.symbol).catch(() => null),
                    getAuthenticatedTradingFee(sellExchange as SupportedExchange, sellConn!, opp.symbol).catch(() => null),
                ]);

                const defaultTakerFeeBpsPerLeg = Math.max(0, numEnv("ARB_TAKER_FEE_BPS", 10));
                const buyTaker = buyFee?.taker ?? null;
                const sellTaker = sellFee?.taker ?? null;
                const feePct =
                    buyTaker != null && sellTaker != null
                        ? (buyTaker + sellTaker) * 100
                        : (defaultTakerFeeBpsPerLeg * 2) / 100;

                const grossSpreadPct = ((currentSellBid - currentBuyAsk) / currentBuyAsk) * 100;
                const netSpreadPct = grossSpreadPct - feePct;
                const minNetSpreadPct = numEnv("ARB_MIN_NET_SPREAD_PCT", 0.05);
                results.fees = { buy: buyFee, sell: sellFee, feePct };

                if (!Number.isFinite(netSpreadPct) || netSpreadPct < minNetSpreadPct) {
                    return NextResponse.json(
                        {
                            error: "not_profitable",
                            message: `Net spread ${netSpreadPct.toFixed(3)}% below minimum ${minNetSpreadPct}% (fees assumed ${feePct.toFixed(3)}%).`,
                            quote: { buyAsk: currentBuyAsk, sellBid: currentSellBid, grossSpreadPct, netSpreadPct, ts: new Date().toISOString() },
                            fees: results.fees,
                        },
                        { status: 409 },
                    );
                }

                const notionalUsdExec = quantityNum * currentBuyAsk;
                results.sizing = {
                    notionalUsdTarget,
                    notionalUsdExec,
                    qtyPrecision,
                };

                results.quote = {
                    buyAsk: currentBuyAsk,
                    sellBid: currentSellBid,
                    grossSpreadPct,
                    netSpreadPct,
                    ts: new Date().toISOString(),
                };

                const quantity = quantityNum.toFixed(qtyPrecision);

                try {
                    if (isInternalBuy) {
                        results.buy = { status: "filled", price: opp.buyAsk, exchange: "tradesynapse" };
                    } else {
                        results.buy = await placeExchangeOrder(buyExchange as SupportedExchange, buyConn!, {
                            symbol: opp.symbol,
                            side: "buy",
                            type: "market",
                            quantity,
                        });
                    }

                    if (results.buy) {
                        if (isInternalSell) {
                            results.sell = { status: "filled", price: opp.sellBid, exchange: "tradesynapse" };
                        } else {
                            results.sell = await placeExchangeOrder(sellExchange as SupportedExchange, sellConn!, {
                                symbol: opp.symbol,
                                side: "sell",
                                type: "market",
                                quantity,
                            });
                        }
                    }
                } catch (err) {
                    console.error("Arbitrage execution failed:", err);
                    return NextResponse.json(
                        {
                            success: false,
                            message: "Execution halted",
                            error: err instanceof Error ? err.message : String(err),
                            partialResults: results,
                        },
                        { status: 500 },
                    );
                }

        return NextResponse.json({ success: true, data: results });
    } catch (e) {
        const resp = responseForDbError("exchange.arbitrage.execute", e);
        if (resp) return resp;
        throw e;
    }
}
