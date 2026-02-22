import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { getExternalIndexUsdt } from "@/lib/market/indexPrice";
import { getOrComputeFxReferenceRate } from "@/lib/fx/reference";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  max: z
    .string()
    .optional()
    .transform((v) => (v == null ? 200 : Math.max(1, Math.min(2000, Number(v) || 200)))),
});

function isProd() {
  return String(process.env.NODE_ENV ?? "").toLowerCase() === "production";
}

function isEnabledInProd(): boolean {
  return String(process.env.EXCHANGE_ENABLE_PRICE_ALERTS ?? "").trim() === "1";
}

function checkCronSecret(request: Request): boolean {
  const expected = String(process.env.EXCHANGE_CRON_SECRET ?? process.env.CRON_SECRET ?? "").trim();
  if (!expected) return false;
  const got = request.headers.get("x-cron-secret") ?? new URL(request.url).searchParams.get("secret") ?? "";
  return got === expected;
}

/**
 * POST /api/cron/price-alerts
 * Secured with x-cron-secret.
 */
export async function POST(request: Request) {
  if (isProd() && !isEnabledInProd()) return apiError("forbidden");
  if (!checkCronSecret(request)) return apiError("forbidden");

  const url = new URL(request.url);
  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({ max: url.searchParams.get("max") ?? undefined });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const sql = getSql();

  try {
    const alerts = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          id: string;
          user_id: string;
          base_symbol: string;
          fiat: string;
          direction: "above" | "below";
          threshold: string;
          cooldown_sec: number;
          last_triggered_at: string | null;
        }[]
      >`
        SELECT
          id::text,
          user_id::text,
          base_symbol,
          fiat,
          direction,
          threshold::text,
          cooldown_sec,
          last_triggered_at
        FROM app_price_alert
        WHERE status = 'active'
        ORDER BY created_at ASC
        LIMIT ${q.max}
      `;
    });

    const now = Date.now();
    const indexByBase = new Map<string, Awaited<ReturnType<typeof getExternalIndexUsdt>> | null>();
    const fxByFiat = new Map<string, number>();

    let triggered = 0;
    for (const a of alerts) {
      const lastMs = a.last_triggered_at ? new Date(a.last_triggered_at).getTime() : 0;
      const cooldownMs = Math.max(60_000, Math.floor((a.cooldown_sec ?? 3600) * 1000));
      if (lastMs && now - lastMs < cooldownMs) continue;

      const base = a.base_symbol.toUpperCase();
      const fiat = a.fiat.toUpperCase();

      if (!indexByBase.has(base)) {
        const q = await getExternalIndexUsdt(base);
        indexByBase.set(base, q);
      }

      const quote = indexByBase.get(base) ?? null;
      const usdt = quote?.mid ?? null;
      if (usdt == null || !Number.isFinite(usdt) || usdt <= 0) continue;

      if (!fxByFiat.has(fiat)) {
        const r = await getOrComputeFxReferenceRate(sql, "USDT", fiat);
        const rate = r ? Number(r.mid) : 0;
        fxByFiat.set(fiat, Number.isFinite(rate) ? rate : 0);
      }
      const usdtFiat = fxByFiat.get(fiat) ?? 0;
      if (!Number.isFinite(usdtFiat) || usdtFiat <= 0) continue;

      const priceFiat = usdt * usdtFiat;
      const threshold = Number(a.threshold);
      if (!Number.isFinite(threshold) || threshold <= 0) continue;

      const hit = a.direction === "above" ? priceFiat >= threshold : priceFiat <= threshold;
      if (!hit) continue;

      triggered++;

      await retryOnceOnTransientDbError(async () => {
        await sql`
          UPDATE app_price_alert
          SET last_triggered_at = now()
          WHERE id = ${a.id}::uuid
        `;

        await createNotification(sql, {
          userId: a.user_id,
          type: "price_alert",
          title: `${base} alert` ,
          body: `${base} is ${a.direction} ${threshold.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${fiat}`,
          metadata: {
            base_symbol: base,
            fiat,
            direction: a.direction,
            threshold: String(threshold),
            price: String(priceFiat),
          },
        });
      });
    }

    return Response.json({ ok: true, scanned: alerts.length, triggered });
  } catch (e) {
    const resp = responseForDbError("cron.price-alerts", e);
    if (resp) return resp;
    throw e;
  }
}

// Allow simple cron providers that only support GET.
export async function GET(request: Request) {
  return POST(request);
}
