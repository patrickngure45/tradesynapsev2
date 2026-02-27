import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  try {
    const markets = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          id: string;
          chain: string;
          symbol: string;
          status: string;
          tick_size: string;
          lot_size: string;
          maker_fee_bps: number;
          taker_fee_bps: number;
          created_at: string;
        }[]
      >`
        SELECT
          id::text,
          chain,
          symbol,
          status,
          tick_size::text AS tick_size,
          lot_size::text AS lot_size,
          maker_fee_bps,
          taker_fee_bps,
          created_at::text
        FROM ex_market
        ORDER BY chain ASC, symbol ASC
      `;
    });

    return NextResponse.json({ ok: true, markets }, { status: 200 });
  } catch (e) {
    const resp = responseForDbError("exchange.admin.markets.list", e);
    if (resp) return resp;
    return apiError("internal_error");
  }
}
