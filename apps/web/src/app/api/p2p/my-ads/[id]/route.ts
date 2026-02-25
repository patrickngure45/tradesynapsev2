import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getOrComputeFxReferenceRate } from "@/lib/fx/reference";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";

export const dynamic = "force-dynamic";

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function parsePaymentMethodIds(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean);
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    if (s.startsWith("[")) {
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) return arr.map((x) => String(x)).filter(Boolean);
      } catch {
        return [];
      }
    }
    return [];
  }
  if (typeof raw === "object") {
    const asAny = raw as any;
    if (Array.isArray(asAny)) return asAny.map((x: any) => String(x)).filter(Boolean);
  }
  return [];
}

const patchSchema = z
  .object({
    status: z.enum(["online", "offline"]).optional(),
    fixed_price: z.number().positive().optional(),
    min_limit: z.number().nonnegative().optional(),
    max_limit: z.number().positive().optional(),
    payment_window_minutes: z.number().min(15).max(180).optional(),
    terms: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (typeof data.min_limit === "number" && typeof data.max_limit === "number") {
      if (data.min_limit > data.max_limit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["min_limit"],
          message: "min_limit must be <= max_limit.",
        });
      }
    }
  });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const actingUserId = getActingUserId(req);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  const sql = getSql();
  const rl = await enforceAccountSecurityRateLimit({
    sql: sql as any,
    request: req,
    limiterName: "p2p.my_ads.patch",
    windowMs: 60_000,
    max: 20,
    userId: actingUserId,
  });
  if (rl) return rl;

  const id = String(params?.id ?? "").trim();
  if (!id) return apiError("invalid_input", { status: 400, details: { message: "Missing id." } });

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return apiZodError(parsed.error) ?? apiError("invalid_input");

    const [ad] = await sql<
      {
        id: string;
        user_id: string;
        side: "BUY" | "SELL";
        status: "online" | "offline" | "closed";
        fiat_currency: string;
        fixed_price: string | null;
        remaining_amount: string;
        payment_method_ids: unknown;
        inventory_hold_id: string | null;
      }[]
    >`
      SELECT id::text, user_id::text, side, status, fiat_currency, fixed_price::text, remaining_amount::text, payment_method_ids, inventory_hold_id::text
      FROM p2p_ad
      WHERE id = ${id}::uuid AND user_id = ${actingUserId}::uuid
      LIMIT 1
    `;

    if (!ad) return apiError("not_found", { status: 404 });
    if (ad.status === "closed") {
      return apiError("p2p_ad_closed", { status: 409, details: { message: "This ad is closed and cannot be modified." } });
    }

    const nextStatus = parsed.data.status ?? null;
    const transitioningOnline = nextStatus === "online" && ad.status !== "online";

    if (transitioningOnline) {
      const maxOnlineAds = Math.max(0, Math.min(100, Number(process.env.P2P_MAX_ONLINE_ADS_PER_USER ?? "3")));
      if (maxOnlineAds > 0) {
        const rows = await sql<{ n: number }[]>`
          SELECT count(*)::int AS n
          FROM p2p_ad
          WHERE user_id = ${actingUserId}::uuid
            AND status = 'online'
            AND id <> ${id}::uuid
        `;
        const current = Number(rows[0]?.n ?? 0);
        if (Number.isFinite(current) && current >= maxOnlineAds) {
          return apiError("ad_limit_reached", { status: 409, details: { max_online_ads: maxOnlineAds } });
        }
      }
    }

    if (transitioningOnline && ad.side === "SELL") {
      const methodIds = parsePaymentMethodIds(ad.payment_method_ids).slice(0, 3);
      if (!methodIds.length) {
        return apiError("invalid_input", {
          status: 409,
          details: { message: "SELL ads must include at least one payment method." },
        });
      }

      const owned = await sql<{ id: string; identifier: string; details: unknown }[]>`
        SELECT id::text AS id, lower(identifier)::text AS identifier, details
        FROM p2p_payment_method
        WHERE user_id = ${actingUserId}::uuid
          AND is_enabled = true
          AND id::text = ANY(${methodIds})
      `;
      if (owned.length !== methodIds.length) {
        return apiError("invalid_input", {
          status: 409,
          details: { message: "One or more payment methods are invalid, disabled, or not yours." },
        });
      }

      for (const m of owned) {
        const details = m.details as any;
        const isObj = Boolean(details) && typeof details === "object" && !Array.isArray(details);
        const isEmptyObj = isObj && Object.keys(details).length === 0;
        if (!isObj || isEmptyObj) {
          return apiError("invalid_input", {
            status: 409,
            details: { message: "One or more payment methods are missing required payout details." },
          });
        }
        if (String(m.identifier).toLowerCase() === "mpesa") {
          const phone = typeof details.phoneNumber === "string" ? details.phoneNumber.trim() : "";
          if (!phone) {
            return apiError("invalid_input", {
              status: 409,
              details: { message: "M-Pesa payout methods must include details.phoneNumber." },
            });
          }
        }
      }

      if (!ad.inventory_hold_id) {
        return apiError("p2p_ad_inventory_missing", {
          status: 409,
          details: { message: "This SELL ad is missing its escrow inventory hold." },
        });
      }

      const holdRows = await sql<
        { status: string; remaining_amount: string; user_id: string }[]
      >`
        SELECT h.status::text AS status, h.remaining_amount::text AS remaining_amount, a.user_id::text AS user_id
        FROM ex_hold h
        JOIN ex_ledger_account a ON a.id = h.account_id
        WHERE h.id = ${ad.inventory_hold_id}::uuid
        LIMIT 1
      `;
      const hold = holdRows[0] ?? null;
      if (!hold || String(hold.user_id) !== String(actingUserId)) {
        return apiError("p2p_ad_inventory_missing", {
          status: 409,
          details: { message: "This SELL ad escrow hold is unavailable." },
        });
      }
      if (String(hold.status) !== "active") {
        return apiError("p2p_ad_inventory_missing", {
          status: 409,
          details: { message: "This SELL ad escrow hold is not active." },
        });
      }
    }

    const nextFixed = typeof parsed.data.fixed_price === "number" ? parsed.data.fixed_price : ad.fixed_price ? Number(ad.fixed_price) : null;
    const nextMin = typeof parsed.data.min_limit === "number" ? parsed.data.min_limit : null;
    const nextMax = typeof parsed.data.max_limit === "number" ? parsed.data.max_limit : null;

    if (typeof nextMin === "number" && typeof nextMax === "number" && nextMin > nextMax) {
      return apiError("invalid_input", { status: 400, details: { message: "min_limit must be <= max_limit." } });
    }

    if (typeof nextMin === "number" || typeof nextMax === "number") {
      const fiatUpper = String(ad.fiat_currency ?? "").toUpperCase();
      let minUsd = clamp(Number(process.env.P2P_MIN_TRADE_USD ?? "5"), 0.5, 10_000);
      const maxUsd = clamp(Number(process.env.P2P_MAX_TRADE_USD ?? "2000"), minUsd, 100_000);
      if (ad.side === "SELL") {
        const sellMinUsd = clamp(Number(process.env.P2P_MIN_SELL_AD_TRADE_USD ?? "20"), 0.5, 10_000);
        minUsd = Math.max(minUsd, sellMinUsd);
      }

      const usdtFiat = await getOrComputeFxReferenceRate(sql as any, "USDT", fiatUpper);
      if (!usdtFiat?.mid) {
        return apiError("fx_unavailable", { status: 503, details: { base: "USDT", quote: fiatUpper } });
      }
      const minFiat = Math.ceil(minUsd * usdtFiat.mid);
      const maxFiat = Math.floor(maxUsd * usdtFiat.mid);

      if (typeof nextMin === "number" && nextMin < minFiat) {
        return apiError("min_limit_too_low", {
          status: 409,
          details: { min_limit: nextMin, required_min: minFiat, fiat: fiatUpper, min_usd: minUsd },
        });
      }
      if (typeof nextMax === "number" && nextMax > maxFiat) {
        return apiError("max_limit_too_high", {
          status: 409,
          details: { max_limit: nextMax, allowed_max: maxFiat, fiat: fiatUpper, max_usd: maxUsd },
        });
      }
    }

    if (typeof nextFixed === "number" && Number.isFinite(nextFixed) && nextFixed > 0) {
      const remaining = Number(ad.remaining_amount ?? "0");
      const maxByLiquidity = Math.floor(remaining * nextFixed);
      if (Number.isFinite(maxByLiquidity) && maxByLiquidity > 0) {
        if (typeof nextMax === "number" && nextMax > maxByLiquidity) {
          return apiError("p2p_ad_max_limit_exceeds_liquidity", {
            status: 409,
            details: { max_limit: nextMax, allowed_max: maxByLiquidity },
          });
        }
      }
    }

    const updates: Record<string, any> = {};
    if (parsed.data.status) updates.status = parsed.data.status;
    if (typeof parsed.data.fixed_price === "number") updates.fixed_price = parsed.data.fixed_price;
    if (typeof parsed.data.min_limit === "number") updates.min_limit = parsed.data.min_limit;
    if (typeof parsed.data.max_limit === "number") updates.max_limit = parsed.data.max_limit;
    if (typeof parsed.data.payment_window_minutes === "number") updates.payment_window_minutes = parsed.data.payment_window_minutes;
    if (parsed.data.terms !== undefined) updates.terms = parsed.data.terms ?? "";

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true });
    }

    const [updated] = await sql`
      UPDATE p2p_ad
      SET
        status = coalesce(${updates.status ?? null}, status),
        fixed_price = coalesce(${updates.fixed_price ?? null}, fixed_price),
        min_limit = coalesce(${updates.min_limit ?? null}, min_limit),
        max_limit = coalesce(${updates.max_limit ?? null}, max_limit),
        payment_window_minutes = coalesce(${updates.payment_window_minutes ?? null}, payment_window_minutes),
        terms = coalesce(${updates.terms ?? null}, terms),
        updated_at = now()
      WHERE id = ${id}::uuid AND user_id = ${actingUserId}::uuid
      RETURNING id
    `;

    if (!updated?.id) return apiError("not_found", { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return apiError("internal_error", { details: error?.message ?? String(error) });
  }
}
