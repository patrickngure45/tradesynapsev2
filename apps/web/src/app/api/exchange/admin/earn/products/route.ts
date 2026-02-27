import { z } from "zod";
import { NextResponse } from "next/server";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    chain: z.enum(["bsc"]).default("bsc"),
    asset_id: z.string().uuid().optional(),
    asset_symbol: z.string().trim().min(1).max(32).optional(),
    kind: z.enum(["flexible", "locked"]),
    lock_days: z.coerce.number().int().min(1).optional().nullable(),
    apr_bps: z.coerce.number().int().min(0).max(1_000_000),
    status: z.enum(["enabled", "disabled"]).optional(),
  })
  .superRefine((val, ctx) => {
    const hasAsset = Boolean(val.asset_id) || Boolean(val.asset_symbol);
    if (!hasAsset) ctx.addIssue({ code: "custom", message: "asset_required", path: ["asset_symbol"] });

    if (val.kind === "flexible") {
      if (val.lock_days != null) ctx.addIssue({ code: "custom", message: "lock_days_not_allowed", path: ["lock_days"] });
    } else {
      if (val.lock_days == null) ctx.addIssue({ code: "custom", message: "lock_days_required", path: ["lock_days"] });
    }
  });

export async function GET(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  try {
    const products = await retryOnceOnTransientDbError(async () => {
      return await sql<
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
        SELECT
          p.id::text,
          p.chain,
          p.asset_id::text AS asset_id,
          a.symbol AS asset_symbol,
          a.name AS asset_name,
          a.decimals AS asset_decimals,
          p.kind,
          p.lock_days,
          p.apr_bps,
          p.status,
          p.created_at::text,
          p.updated_at::text
        FROM earn_product p
        JOIN ex_asset a ON a.id = p.asset_id
        ORDER BY a.symbol ASC, p.kind ASC, p.lock_days NULLS FIRST
      `;
    });

    return NextResponse.json({ ok: true, products }, { status: 200 });
  } catch (e) {
    const resp = responseForDbError("exchange.admin.earn.products.list", e);
    if (resp) return resp;
    return apiError("internal_error");
  }
}

export async function POST(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  const json = await request.json().catch(() => ({}));
  let input: z.infer<typeof createSchema>;
  try {
    input = createSchema.parse(json);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    const created = await retryOnceOnTransientDbError(async () => {
      const assetId = await (async (): Promise<string | null> => {
        if (input.asset_id) return input.asset_id;
        const symbol = String(input.asset_symbol ?? "").trim();
        if (!symbol) return null;

        const rows = await sql<{ id: string }[]>`
          SELECT id::text AS id
          FROM ex_asset
          WHERE chain = ${input.chain}
            AND upper(symbol) = upper(${symbol})
          LIMIT 1
        `;
        return rows[0]?.id ?? null;
      })();

      if (!assetId) return { kind: "not_found" as const };

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
        WITH ins AS (
          INSERT INTO earn_product (chain, asset_id, kind, lock_days, apr_bps, status)
          VALUES (
            ${input.chain},
            ${assetId}::uuid,
            ${input.kind},
            ${input.kind === "flexible" ? null : input.lock_days ?? null},
            ${input.apr_bps},
            ${input.status ?? "enabled"}
          )
          RETURNING *
        )
        SELECT
          ins.id::text,
          ins.chain,
          ins.asset_id::text AS asset_id,
          a.symbol AS asset_symbol,
          a.name AS asset_name,
          a.decimals AS asset_decimals,
          ins.kind,
          ins.lock_days,
          ins.apr_bps,
          ins.status,
          ins.created_at::text,
          ins.updated_at::text
        FROM ins
        JOIN ex_asset a ON a.id = ins.asset_id
      `;

      return { kind: "ok" as const, product: rows[0] ?? null };
    });

    if (created.kind === "not_found") return apiError("asset_not_found");
    if (!created.product) return apiError("internal_error");

    return NextResponse.json({ ok: true, product: created.product }, { status: 201 });
  } catch (e) {
    const resp = responseForDbError("exchange.admin.earn.products.create", e);
    if (resp) return resp;
    return apiError("internal_error");
  }
}
