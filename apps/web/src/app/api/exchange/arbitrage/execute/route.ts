
import { z } from "zod";

import { NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { responseForDbError } from "@/lib/dbTransient";
import { decryptCredential } from "@/lib/auth/credentials";
import { getExchangeTicker, placeExchangeOrder, type ExchangeCredentials, type SupportedExchange } from "@/lib/exchange/externalApis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function numEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    const v = raw ? Number(raw) : NaN;
    return Number.isFinite(v) ? v : fallback;
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

        // Safety: disable auto-trade unless explicitly enabled.
        if (process.env.ARB_AUTOTRADE_ENABLED !== "1") {
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

                // Internal execution is not implemented (avoid false fills).
                if (isInternalBuy || isInternalSell) {
                    return NextResponse.json(
                        {
                            error: "internal_execution_not_supported",
                            message: "Auto-trade is only supported for external exchanges right now.",
                        },
                        { status: 400 },
                    );
                }

                // Trading support is currently limited in externalApis.placeExchangeOrder.
                const supportedExternal = new Set<SupportedExchange>(["binance", "bybit"]);
        if (!isInternalBuy && !supportedExternal.has(buyExchange as SupportedExchange)) {
            return NextResponse.json({ error: `unsupported_buy_exchange:${buyExchange}` }, { status: 400 });
        }
        if (!isInternalSell && !supportedExternal.has(sellExchange as SupportedExchange)) {
            return NextResponse.json({ error: `unsupported_sell_exchange:${sellExchange}` }, { status: 400 });
        }

        const exchangesToFetch = [
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

        if (!isInternalBuy && !buyConn) {
            return NextResponse.json({ error: `missing_connection:${buyExchange}` }, { status: 400 });
        }
        if (!isInternalSell && !sellConn) {
            return NextResponse.json({ error: `missing_connection:${sellExchange}` }, { status: 400 });
        }

                const results: { buy: unknown; sell: unknown; quote?: unknown } = { buy: null, sell: null };

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

                const takerFeeBpsPerLeg = Math.max(0, numEnv("ARB_TAKER_FEE_BPS", 10)); // 10 bps = 0.10% per leg default
                const feePct = (takerFeeBpsPerLeg * 2) / 100; // bps -> percent, two legs
                const grossSpreadPct = ((currentSellBid - currentBuyAsk) / currentBuyAsk) * 100;
                const netSpreadPct = grossSpreadPct - feePct;
                const minNetSpreadPct = numEnv("ARB_MIN_NET_SPREAD_PCT", 0.05);
                if (!Number.isFinite(netSpreadPct) || netSpreadPct < minNetSpreadPct) {
                    return NextResponse.json(
                        {
                            error: "not_profitable",
                            message: `Net spread ${netSpreadPct.toFixed(3)}% below minimum ${minNetSpreadPct}% (fees assumed ${feePct.toFixed(3)}%).`,
                            quote: { buyAsk: currentBuyAsk, sellBid: currentSellBid, grossSpreadPct, netSpreadPct, ts: new Date().toISOString() },
                        },
                        { status: 409 },
                    );
                }

                results.quote = { buyAsk: currentBuyAsk, sellBid: currentSellBid, grossSpreadPct, netSpreadPct, ts: new Date().toISOString() };

                const tradeSizeUsd = Math.max(5, numEnv("ARB_TRADE_SIZE_USD", 50));
                const quantity = (tradeSizeUsd / currentBuyAsk).toFixed(6);

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
