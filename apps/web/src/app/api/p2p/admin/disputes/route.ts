import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["open", "resolved"]).optional(),
});

export async function GET(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return apiError("invalid_input", { status: 400, details: parsed.error.issues });
  }
  const { limit, offset, status } = parsed.data;

  try {
    const rows = await sql<
      {
        id: string;
        order_id: string;
        opened_by_user_id: string;
        reason: string;
        status: string;
        created_at: string;
        resolved_at: string | null;
        resolution_outcome: string | null;
        buyer_id: string;
        seller_id: string;
        order_status: string;
        amount_asset: string;
        amount_fiat: string;
        fiat_currency: string;
        asset_symbol: string;
      }[]
    >`
      SELECT
        d.id::text,
        d.order_id::text,
        d.opened_by_user_id::text,
        d.reason,
        d.status,
        d.created_at::text,
        d.resolved_at::text,
        d.resolution_outcome,
        o.buyer_id::text,
        o.seller_id::text,
        o.status AS order_status,
        o.amount_asset::text,
        o.amount_fiat::text,
        o.fiat_currency,
        a.symbol AS asset_symbol
      FROM p2p_dispute d
      JOIN p2p_order o ON o.id = d.order_id
      JOIN ex_asset a ON a.id = o.asset_id
      WHERE 1=1
        ${status ? sql`AND d.status = ${status}` : sql``}
      ORDER BY d.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const countRows = await sql<{ total: number }[]>`
      SELECT count(*)::int AS total
      FROM p2p_dispute d
      WHERE 1=1
        ${status ? sql`AND d.status = ${status}` : sql``}
    `;

    return Response.json({ rows, total: countRows[0]?.total ?? 0, limit, offset });
  } catch (e) {
    console.error("[GET /api/p2p/admin/disputes] error", e);
    return apiError("internal_error");
  }
}
