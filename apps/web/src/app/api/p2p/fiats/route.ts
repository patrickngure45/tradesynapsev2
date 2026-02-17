import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const schema = z.object({
  side: z.enum(["BUY", "SELL"]).default("BUY"),
  asset: z.string().default("USDT"),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return apiZodError(parsed.error) ?? apiError("invalid_input");

    const { side, asset } = parsed.data;
    const sql = getSql();

    const assetUpper = asset.trim().toUpperCase();
    const targetSide = side === "BUY" ? "SELL" : "BUY";

    const [assetRow] = await sql<{ id: string }[]>`
      SELECT id::text AS id
      FROM ex_asset
      WHERE symbol = ${assetUpper}
        AND chain = 'bsc'
        AND is_enabled = true
      LIMIT 1
    `;

    if (!assetRow?.id) return NextResponse.json({ fiats: [] });

    const rows = await sql<{ fiat_currency: string; cnt: number }[]>`
      SELECT ad.fiat_currency, count(*)::int AS cnt
      FROM p2p_ad ad
      WHERE ad.status = 'online'
        AND ad.side = ${targetSide}
        AND ad.asset_id = ${assetRow.id}::uuid
        AND ad.remaining_amount > 0
      GROUP BY ad.fiat_currency
      ORDER BY cnt DESC, ad.fiat_currency ASC
      LIMIT 50
    `;

    const fiats = rows.map((r) => String(r.fiat_currency).toUpperCase());
    return NextResponse.json({ fiats, counts: Object.fromEntries(rows.map((r) => [String(r.fiat_currency).toUpperCase(), r.cnt])) });
  } catch (e: any) {
    return apiError(e?.message || "internal_error", { details: e });
  }
}
