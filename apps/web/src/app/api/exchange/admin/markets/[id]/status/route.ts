import { z } from "zod";
import { NextResponse } from "next/server";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  status: z.enum(["enabled", "disabled"]),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  const params = await ctx.params;
  const marketId = String(params.id ?? "").trim();
  if (!z.string().uuid().safeParse(marketId).success) return apiError("invalid_market_id");

  const json = await request.json().catch(() => ({}));
  let input: z.infer<typeof postSchema>;
  try {
    input = postSchema.parse(json);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    const updated = await retryOnceOnTransientDbError(async () => {
      const rows = await sql<{ id: string; status: string }[]>`
        UPDATE ex_market
        SET status = ${input.status}
        WHERE id = ${marketId}::uuid
        RETURNING id::text, status
      `;
      return rows[0] ?? null;
    });

    if (!updated) return NextResponse.json({ ok: false, error: "market_not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, market: updated }, { status: 200 });
  } catch (e) {
    const resp = responseForDbError("exchange.admin.markets.update_status", e);
    if (resp) return resp;
    return apiError("internal_error");
  }
}
