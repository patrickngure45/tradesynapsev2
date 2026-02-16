import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { amount3818PositiveSchema } from "@/lib/exchange/amount";
import { quoteConvert } from "@/lib/exchange/convert";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().min(1).max(12),
  to: z.string().min(1).max(12),
  amount_in: amount3818PositiveSchema,
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({
      from: url.searchParams.get("from") ?? "",
      to: url.searchParams.get("to") ?? "",
      amount_in: url.searchParams.get("amount_in") ?? "",
    });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const sql = getSql();

  try {
    const quote = await quoteConvert(sql as any, {
      fromSymbol: q.from,
      toSymbol: q.to,
      amountIn: q.amount_in,
    });
    if (!quote) return apiError("quote_unavailable", { status: 409 });

    return Response.json({ ok: true, quote }, { status: 200 });
  } catch (e) {
    const resp = responseForDbError("exchange.convert.quote", e);
    if (resp) return resp;
    console.error("exchange.convert.quote failed:", e);
    return apiError("internal_error", {
      details: { message: e instanceof Error ? e.message : String(e) },
    });
  }
}
