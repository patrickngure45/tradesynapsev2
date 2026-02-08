
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getSessionTokenFromRequest, verifySessionToken } from "@/lib/auth/session";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { placeExchangeOrder, type ExchangeCredentials } from "@/lib/exchange/externalApis";

export async function POST(req: Request) {
  const sql = getSql();
  
  // 1. Auth check
  const token = getSessionTokenFromRequest(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const verified = verifySessionToken({
    token,
    secret: process.env.SESSION_SECRET || "default_dev_secret_12345"
  });
  
  if (!verified.ok) {
     return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const userId = verified.payload.uid;
  const activeErr = await requireActiveUser(sql, userId);
  if (activeErr) {
     return NextResponse.json({ error: activeErr }, { status: 403 });
  }

  // 2. Parse payload
  const body = await req.json();
  const { opp } = body; 
  // opp structure: { symbol, buyExchange, sellExchange, buyAsk, sellBid, ... }

  if (!opp || !opp.symbol || !opp.buyExchange || !opp.sellExchange) {
      return NextResponse.json({ error: "Invalid opportunity data" }, { status: 400 });
  }

  // 3. Fetch Connections
  const connections = await sql<{ exchange: string, api_key: string, api_secret: string, passphrase?: string }[]>`
      SELECT exchange, api_key, api_secret, passphrase
      FROM ex_api_connection
      WHERE user_id = ${userId}
      AND exchange IN (${opp.buyExchange.toLowerCase()}, ${opp.sellExchange.toLowerCase()})
  `;

  const buyConn = connections.find(c => c.exchange === opp.buyExchange.toLowerCase());
  const sellConn = connections.find(c => c.exchange === opp.sellExchange.toLowerCase());

  // 4. Validate Connectivity
  const isInternalBuy = opp.buyExchange.toLowerCase() === 'tradesynapse';
  const isInternalSell = opp.sellExchange.toLowerCase() === 'tradesynapse';

  if (!isInternalBuy && !buyConn) {
      return NextResponse.json({ error: `Missing connection for ${opp.buyExchange}` }, { status: 400 });
  }
  if (!isInternalSell && !sellConn) {
       return NextResponse.json({ error: `Missing connection for ${opp.sellExchange}` }, { status: 400 });
  }

  const results = {
      buy: null as any,
      sell: null as any
  };

  // 5. Execute - Parallel or Sequential? Sequential is safer for arbitrage to avoid "leg risk" 
  // (buying then failing to sell), but Parallel is faster. We'll do Sequential: Buy -> Sell.
  
  // Calculate quantity based on a fixed trade size (e.g. $50 USD)
  const TRADE_SIZE_USD = 50; 
  // Quantity = Target USD / Price per unit. 
  // We use detailed formatting to avoid scientific notation and ensure reasonable precision (5 decimals is safe for most high-value pairs).
  const calculatedQty = (TRADE_SIZE_USD / opp.buyAsk).toFixed(6);

  const quantity = calculatedQty; 

  try {
      // --- LEG 1: BUY ---
      if (isInternalBuy) {
          // Simulate Internal Execution (Insert into order book)
          // For now, we'll just "mock" it as successful 
           results.buy = { status: "filled", price: opp.buyAsk, exchange: "tradesynapse" };
      } else {
          // External Buy
          const creds: ExchangeCredentials = {
              apiKey: buyConn!.api_key,
              apiSecret: buyConn!.api_secret,
              passphrase: buyConn!.passphrase
          };
          results.buy = await placeExchangeOrder(
              opp.buyExchange.toLowerCase() as any, 
              creds, 
              {
                symbol: opp.symbol, // Ensure normalized? External APIs usually take standard pairs like BTCUSDT
                side: "buy",
                type: "market",
                quantity: quantity
              }
          );
      }

      // --- LEG 2: SELL ---
      if (results.buy) {
          if (isInternalSell) {
             // Simulate Internal Execution
             results.sell = { status: "filled", price: opp.sellBid, exchange: "tradesynapse" };
          } else {
             // External Sell
             const creds: ExchangeCredentials = {
                apiKey: sellConn!.api_key,
                apiSecret: sellConn!.api_secret,
                passphrase: sellConn!.passphrase
            };
            results.sell = await placeExchangeOrder(
                opp.sellExchange.toLowerCase() as any,
                creds,
                {
                    symbol: opp.symbol,
                    side: "sell",
                    type: "market",
                    quantity: quantity
                }
            );
          }
      }

  } catch (err: any) {
      console.error("Arbitrage execution failed:", err);
      // Essential: IF Buy succeeded but Sell failed, we are holding a bag!
      // A robust system needs a "Rollback" or "Emergency Liquidation" logic here.
      // For MVP, we just report the error.
      return NextResponse.json({ 
          success: false, 
          message: "Execution halted", 
          error: err.message,
          partialResults: results 
        }, { status: 500 });
  }

  return NextResponse.json({
      success: true,
      data: results
  });
}
