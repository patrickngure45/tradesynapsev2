
import { z } from "zod";

import { NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { responseForDbError } from "@/lib/dbTransient";
import { decryptCredential } from "@/lib/auth/credentials";
import { placeExchangeOrder, type ExchangeCredentials, type SupportedExchange } from "@/lib/exchange/externalApis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

        const supportedExternal = new Set<SupportedExchange>(["binance", "bybit", "okx"]);
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

        const results: { buy: unknown; sell: unknown } = { buy: null, sell: null };

        const TRADE_SIZE_USD = 50;
        const quantity = (TRADE_SIZE_USD / opp.buyAsk).toFixed(6);

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
