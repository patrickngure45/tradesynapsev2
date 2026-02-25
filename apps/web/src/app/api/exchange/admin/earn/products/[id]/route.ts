import { z } from "zod";
import { NextResponse } from "next/server";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    apr_bps: z.coerce.number().int().min(0).max(1_000_000).optional(),
    status: z.enum(["enabled", "disabled"]).optional(),
  })
  .refine((v) => v.apr_bps != null || v.status != null, { message: "no_changes" });

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  const params = await ctx.params;
  const productId = String(params.id ?? "").trim();
  if (!z.string().uuid().safeParse(productId).success) return apiError("invalid_product_id");

  const json = await request.json().catch(() => ({}));
  let input: z.infer<typeof patchSchema>;
  try {
    input = patchSchema.parse(json);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    const updated = await retryOnceOnTransientDbError(async () => {
      const aprBps: number | null = input.apr_bps ?? null;
      const status: string | null = input.status ?? null;

      const rows = await sql<
        {
          id: string;
          chain: string;
          asset_id: string;
          asset_symbol: string;
          asset_name: string | null;
          asset_decimals: number;
          kind: string;
          lock_days: number | null;
          apr_bps: number;
          status: string;
          created_at: string;
          updated_at: string;
        }[]
      >`
        WITH upd AS (
          UPDATE earn_product
          SET
            apr_bps = COALESCE(${aprBps}, apr_bps),
            status = COALESCE(${status}, status),
            updated_at = now()
          WHERE id = ${productId}::uuid
          RETURNING *
        )
        SELECT
          upd.id::text,
          upd.chain,
          upd.asset_id::text AS asset_id,
          a.symbol AS asset_symbol,
          a.name AS asset_name,
          a.decimals AS asset_decimals,
          upd.kind,
          upd.lock_days,
          upd.apr_bps,
          upd.status,
          upd.created_at::text,
          upd.updated_at::text
        FROM upd
        JOIN ex_asset a ON a.id = upd.asset_id
      `;

      return rows[0] ?? null;
    });

    if (!updated) return NextResponse.json({ ok: false, error: "product_not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, product: updated }, { status: 200 });
  } catch (e) {
    const resp = responseForDbError("exchange.admin.earn.products.patch", e);
    if (resp) return resp;
    return apiError("internal_error");
  }
}
