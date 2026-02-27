import { type NextRequest } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { getOrComputeFxReferenceRate } from "@/lib/fx/reference";

export const dynamic = "force-dynamic";

const schema = z.object({
  asset: z.string().min(2).max(12).transform((s) => s.trim().toUpperCase()),
  fiat: z.string().min(2).max(5).transform((s) => s.trim().toUpperCase()),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return apiZodError(parsed.error) ?? apiError("invalid_input");

    const { asset, fiat } = parsed.data;
    const sql = getSql();

    const ref = await getOrComputeFxReferenceRate(sql as any, asset, fiat);
    if (!ref?.mid) {
      return apiError("fx_unavailable", { status: 503, details: { asset, fiat } });
    }

    return Response.json(
      {
        ok: true,
        asset,
        fiat,
        mid: ref.mid,
        bid: ref.bid,
        ask: ref.ask,
        computed_at: ref.computedAt.toISOString(),
        valid_until: ref.validUntil.toISOString(),
        sources: ref.sources,
      },
      { status: 200 },
    );
  } catch (e: any) {
    return apiError(e?.message || "internal_error", { details: e });
  }
}
