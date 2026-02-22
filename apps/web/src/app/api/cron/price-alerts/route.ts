import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { getExternalIndexUsdt } from "@/lib/market/indexPrice";
import { getOrComputeFxReferenceRate } from "@/lib/fx/reference";
import { createNotification } from "@/lib/notifications";
import { upsertServiceHeartbeat } from "@/lib/system/heartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

function spreadBpsFromSources(quote: Awaited<ReturnType<typeof getExternalIndexUsdt>>): number | null {
  if (!quote) return null;
  const spreads: number[] = [];
  for (const s of quote.sources ?? []) {
    const bid = s.bid;
    const ask = s.ask;
    const mid = s.mid ?? (typeof bid === "number" && typeof ask === "number" ? (bid + ask) / 2 : null);
    if (typeof bid !== "number" || typeof ask !== "number") continue;
    if (!Number.isFinite(bid) || !Number.isFinite(ask)) continue;
    if (!Number.isFinite(mid as any) || (mid as number) <= 0) continue;
    const bps = ((ask - bid) / (mid as number)) * 10_000;
    if (Number.isFinite(bps) && bps >= 0) spreads.push(bps);
  }
  return median(spreads);
}

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
  const startedAt = Date.now();
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
          template: string;
          direction: "above" | "below";
          threshold: string;
          window_sec: number | null;
          pct_change: string | null;
          spread_bps: string | null;
          volatility_pct: string | null;
          cooldown_sec: number;
          last_triggered_at: string | null;
          last_value: string | null;
          last_value_at: string | null;
        }[]
      >`
        SELECT
          id::text,
          user_id::text,
          base_symbol,
          fiat,
          template,
          direction,
          threshold::text,
          window_sec,
          pct_change::text,
          spread_bps::text,
          volatility_pct::text,
          cooldown_sec,
          last_triggered_at
          ,last_value::text,
          last_value_at::text
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

      const template = String(a.template ?? "threshold").trim().toLowerCase();
      const threshold = Number(a.threshold);
      const windowSec = a.window_sec != null ? Number(a.window_sec) : null;
      const pctChange = a.pct_change != null ? Number(a.pct_change) : null;
      const spreadBpsThresh = a.spread_bps != null ? Number(a.spread_bps) : null;
      const volPct = a.volatility_pct != null ? Number(a.volatility_pct) : null;

      const lastValue = a.last_value != null ? Number(a.last_value) : null;
      const lastValueAtMs = a.last_value_at ? new Date(a.last_value_at).getTime() : 0;

      let hit = false;
      let title = `${base} alert`;
      let body = "";
      const meta: Record<string, unknown> = { base_symbol: base, fiat, template };

      if (template === "threshold") {
        if (!Number.isFinite(threshold) || threshold <= 0) continue;
        hit = a.direction === "above" ? priceFiat >= threshold : priceFiat <= threshold;
        title = `${base} alert`;
        body = `${base} is ${a.direction} ${threshold.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${fiat}`;
        meta.direction = a.direction;
        meta.threshold = String(threshold);
        meta.price = String(priceFiat);
      } else if (template === "pct_change") {
        if (!windowSec || !pctChange || !Number.isFinite(pctChange) || pctChange <= 0) continue;
        if (!lastValue || !lastValueAtMs) {
          await sql`
            UPDATE app_price_alert
            SET last_value = (${String(priceFiat)}::numeric), last_value_at = now()
            WHERE id = ${a.id}::uuid
          `;
          continue;
        }
        if (now - lastValueAtMs < windowSec * 1000) continue;

        const pct = ((priceFiat - lastValue) / lastValue) * 100;
        const dirHit = a.direction === "above" ? pct >= pctChange : pct <= -pctChange;
        hit = Number.isFinite(pct) && dirHit;
        title = `${base} % change`;
        body = `${base} moved ${pct.toFixed(2)}% in ~${Math.round(windowSec / 60)}m (${fiat})`;
        meta.direction = a.direction;
        meta.window_sec = windowSec;
        meta.pct_change = String(pctChange);
        meta.pct_observed = String(pct);
        meta.price = String(priceFiat);
      } else if (template === "volatility_spike") {
        if (!windowSec || !volPct || !Number.isFinite(volPct) || volPct <= 0) continue;
        if (!lastValue || !lastValueAtMs) {
          await sql`
            UPDATE app_price_alert
            SET last_value = (${String(priceFiat)}::numeric), last_value_at = now()
            WHERE id = ${a.id}::uuid
          `;
          continue;
        }
        if (now - lastValueAtMs < windowSec * 1000) continue;

        const pct = ((priceFiat - lastValue) / lastValue) * 100;
        hit = Number.isFinite(pct) && Math.abs(pct) >= volPct;
        title = `${base} volatility spike`;
        body = `${base} moved ${pct.toFixed(2)}% in ~${Math.round(windowSec / 60)}m (${fiat})`;
        meta.window_sec = windowSec;
        meta.volatility_pct = String(volPct);
        meta.pct_observed = String(pct);
        meta.price = String(priceFiat);
      } else if (template === "spread_widening") {
        if (!spreadBpsThresh || !Number.isFinite(spreadBpsThresh) || spreadBpsThresh <= 0) continue;
        const spreadBps = spreadBpsFromSources(quote);
        if (spreadBps == null || !Number.isFinite(spreadBps)) continue;
        hit = spreadBps >= spreadBpsThresh && (lastValue == null || lastValue < spreadBpsThresh);
        title = `${base} spread widened`;
        body = `${base} spread is ~${spreadBps.toFixed(0)} bps (threshold ${spreadBpsThresh.toFixed(0)} bps)`;
        meta.spread_bps = String(spreadBpsThresh);
        meta.spread_observed_bps = String(spreadBps);
      } else {
        continue;
      }

      // Always update last_value snapshot for templates that rely on it.
      if (template === "pct_change" || template === "volatility_spike") {
        await sql`
          UPDATE app_price_alert
          SET last_value = (${String(priceFiat)}::numeric), last_value_at = now()
          WHERE id = ${a.id}::uuid
        `;
      }
      if (template === "spread_widening") {
        const spreadBps = spreadBpsFromSources(quote);
        if (spreadBps != null && Number.isFinite(spreadBps)) {
          await sql`
            UPDATE app_price_alert
            SET last_value = (${String(spreadBps)}::numeric), last_value_at = now()
            WHERE id = ${a.id}::uuid
          `;
        }
      }

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
          title,
          body,
          metadata: meta,
        });
      });
    }

    const tookMs = Date.now() - startedAt;
    try {
      await upsertServiceHeartbeat(sql as any, {
        service: "cron:price-alerts",
        status: "ok",
        details: { scanned: alerts.length, triggered, took_ms: tookMs },
      });
    } catch {
      // ignore
    }

    return Response.json({ ok: true, scanned: alerts.length, triggered, took_ms: tookMs });
  } catch (e) {
    const tookMs = Date.now() - startedAt;
    try {
      await upsertServiceHeartbeat(sql as any, {
        service: "cron:price-alerts",
        status: "error",
        details: { took_ms: tookMs },
      });
    } catch {
      // ignore
    }
    const resp = responseForDbError("cron.price-alerts", e);
    if (resp) return resp;
    throw e;
  }
}

// Allow simple cron providers that only support GET.
export async function GET(request: Request) {
  return POST(request);
}
