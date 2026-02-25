import { apiError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dev-only helper to seed earn products *after* assets exist.
 *
 * POST /api/earn/dev/seed-products
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") return apiError("not_found");

  const sql = getSql();

  try {
    const assets = await sql<{ id: string; chain: string; symbol: string }[]>`
      SELECT id::text AS id, chain, symbol
      FROM ex_asset
      WHERE chain = 'bsc' AND is_enabled = true
        AND symbol = ANY(ARRAY['USDT','USDC','BNB','BTC','ETH']::text[])
    `;

    const bySym = new Map<string, string>();
    for (const a of assets) bySym.set(String(a.symbol).toUpperCase(), a.id);

    const inserted: Array<{ symbol: string; kind: string; lock_days: number | null; apr_bps: number }> = [];

    const want: Array<{ sym: string; kind: "flexible" | "locked"; lockDays: number | null; aprBps: number }> = [
      { sym: "USDT", kind: "flexible", lockDays: null, aprBps: 350 },
      { sym: "USDT", kind: "locked", lockDays: 7, aprBps: 550 },
      { sym: "USDC", kind: "flexible", lockDays: null, aprBps: 320 },
      { sym: "USDC", kind: "locked", lockDays: 7, aprBps: 500 },
      { sym: "BNB", kind: "flexible", lockDays: null, aprBps: 250 },
      { sym: "BNB", kind: "locked", lockDays: 7, aprBps: 420 },
    ];

    for (const w of want) {
      const assetId = bySym.get(w.sym);
      if (!assetId) continue;
      const rows = await sql<{ id: string }[]>`
        INSERT INTO earn_product (chain, asset_id, kind, lock_days, apr_bps, status)
        VALUES ('bsc', ${assetId}::uuid, ${w.kind}, ${w.lockDays}, ${w.aprBps}, 'enabled')
        ON CONFLICT (asset_id, kind, COALESCE(lock_days, 0)) DO UPDATE
          SET apr_bps = EXCLUDED.apr_bps,
              status = 'enabled',
              updated_at = now()
        RETURNING id::text AS id
      `;
      if (rows[0]?.id) inserted.push({ symbol: w.sym, kind: w.kind, lock_days: w.lockDays, apr_bps: w.aprBps });
    }

    return Response.json({ ok: true, inserted }, { status: 201 });
  } catch (e) {
    const resp = responseForDbError("earn.dev.seed_products", e);
    if (resp) return resp;
    throw e;
  }
}
