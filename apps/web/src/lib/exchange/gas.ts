import { fromBigInt3818, sub3818NonNegative, toBigInt3818 } from "@/lib/exchange/fixed3818";
import { getSql } from "@/lib/db";
import { getBscProvider } from "@/lib/blockchain/wallet";
import { ethers } from "ethers";
import { getExternalIndexUsdt } from "@/lib/market/indexPrice";

const SYSTEM_TREASURY_USER_ID = "00000000-0000-0000-0000-000000000001";
const SYSTEM_BURN_USER_ID = "00000000-0000-0000-0000-000000000003";

type CacheEntry<T> = { expiresAtMs: number; value: T };
const _gasCache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | null {
  const row = _gasCache.get(key);
  if (!row) return null;
  if (Date.now() > row.expiresAtMs) {
    _gasCache.delete(key);
    return null;
  }
  return row.value as T;
}

function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  _gasCache.set(key, { expiresAtMs: Date.now() + Math.max(0, ttlMs), value });
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  const timeoutMs = Math.max(0, Math.trunc(ms));
  if (timeoutMs === 0) return await p;
  return await Promise.race([
    p,
    new Promise<T>((_resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout:${label}`)), timeoutMs);
      // Node: don't keep event loop alive for this timer.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (t as any).unref?.();
    }),
  ]);
}

export type GasChargeError = {
  code:
    | "gas_disabled"
    | "gas_asset_not_found"
    | "gas_fee_invalid"
    | "insufficient_gas";
  details?: unknown;
};

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return fallback;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function envAmount3818(name: string, fallback: string): string {
  const raw = process.env[name];
  const v = (raw ?? "").trim();
  if (v.length === 0) return fallback;
  // Validate by parsing
  toBigInt3818(v);
  return v;
}

function shouldSponsorGasForAction(action: string): boolean {
  const normalized = action.trim().toLowerCase();
  if (normalized !== "user_transfer") return false;
  return envBool("GAS_SPONSOR_USER_TRANSFER", false);
}

export type ChargeGasFeeInput = {
  userId: string;
  action: string;
  reference?: string;
  chain?: string;
  assetSymbol?: string;
};

export type GasFeeQuoteInput = {
  action: string;
  chain?: string;
  assetSymbol?: string;
  /**
   * display: fast response intended for UI (skip slow price conversion)
   * charge: include chargeAmount when possible (used for actually charging)
   */
  purpose?: "display" | "charge";
};

export type GasFeeQuote = {
  enabled: boolean;
  /** Display symbol for the fee (e.g. native chain token like BNB). */
  gasSymbol: string;
  /** Display amount in gasSymbol. */
  amount: string;
  /** If present, the fee will actually be charged in this asset. */
  chargeSymbol?: string;
  /** If present, the fee will actually be charged in chargeSymbol. */
  chargeAmount?: string;
  mode: "static" | "realtime";
  burnBps: number;
  details?: Record<string, unknown>;
};

async function getAssetId(
  sql: ReturnType<typeof getSql>,
  symbol: string
): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    SELECT id::text AS id
    FROM ex_asset
    WHERE chain = 'bsc' AND symbol = ${symbol} AND is_enabled = true
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

async function ensureLedgerAccount(
  sql: ReturnType<typeof getSql>,
  userId: string,
  assetId: string
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO ex_ledger_account (user_id, asset_id)
    VALUES (${userId}::uuid, ${assetId}::uuid)
    ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING id::text AS id
  `;
  return rows[0]!.id;
}

async function ensureSystemUser(sql: ReturnType<typeof getSql>, userId: string): Promise<void> {
  await sql`
    INSERT INTO app_user (id, status, kyc_level, country)
    VALUES (${userId}::uuid, 'active', 'none', NULL)
    ON CONFLICT (id) DO NOTHING
  `;
}

async function getAvailablePostedMinusHeld(
  sql: ReturnType<typeof getSql>,
  accountId: string
): Promise<string> {
  const rows = await sql<{ available: string }[]>`
    WITH posted AS (
      SELECT coalesce(sum(amount), 0)::numeric AS posted
      FROM ex_journal_line
      WHERE account_id = ${accountId}::uuid
    ),
    held AS (
      SELECT coalesce(sum(remaining_amount), 0)::numeric AS held
      FROM ex_hold
      WHERE account_id = ${accountId}::uuid
        AND status = 'active'
    )
    SELECT (posted.posted - held.held)::text AS available
    FROM posted, held
  `;
  return rows[0]?.available ?? "0";
}

async function getLatestPairPrice(
  sql: ReturnType<typeof getSql>,
  baseSymbol: string,
  quoteSymbol: string,
): Promise<number | null> {
  const rows = await sql<
    { price: string; base_symbol: string; quote_symbol: string }[]
  >`
    SELECT
      e.price::text AS price,
      b.symbol AS base_symbol,
      q.symbol AS quote_symbol
    FROM ex_execution e
    JOIN ex_market m ON m.id = e.market_id
    JOIN ex_asset b ON b.id = m.base_asset_id
    JOIN ex_asset q ON q.id = m.quote_asset_id
    WHERE m.chain = 'bsc'
      AND m.status = 'enabled'
      AND (
        (b.symbol = ${baseSymbol} AND q.symbol = ${quoteSymbol})
        OR
        (b.symbol = ${quoteSymbol} AND q.symbol = ${baseSymbol})
      )
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;
  const px = Number(row.price);
  if (!Number.isFinite(px) || px <= 0) return null;

  if (row.base_symbol === baseSymbol && row.quote_symbol === quoteSymbol) return px;
  if (row.base_symbol === quoteSymbol && row.quote_symbol === baseSymbol) return 1 / px;
  return null;
}

async function getUsdtPerUnit(
  sql: ReturnType<typeof getSql>,
  symbol: string,
): Promise<{ usdtPerUnit: number; source: string } | null> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;
  if (sym === "USDT") return { usdtPerUnit: 1, source: "fixed:USDT" };

  const cached = cacheGet<{ usdtPerUnit: number; source: string }>(`usdtPerUnit:${sym}`);
  if (cached) return cached;

  // Prefer internal market executions.
  const internal = await getLatestPairPrice(sql, sym, "USDT");
  if (Number.isFinite(internal) && (internal as number) > 0) {
    const v = { usdtPerUnit: internal as number, source: `market:${sym}/USDT` };
    cacheSet(`usdtPerUnit:${sym}`, v, 30_000);
    return v;
  }

  // External index fallback (not available for USDT).
  // External index fallback can be slow / unavailable.
  try {
    const timeoutMs = envInt("GAS_INDEX_TIMEOUT_MS", 1500);
    const idx = await withTimeout(getExternalIndexUsdt(sym), timeoutMs, `index:${sym}`);
    if (idx?.mid && Number.isFinite(idx.mid) && idx.mid > 0) {
      const v = { usdtPerUnit: idx.mid, source: `index:${sym}USDT` };
      cacheSet(`usdtPerUnit:${sym}`, v, 30_000);
      return v;
    }
  } catch {
    // ignore and fall through
  }

  return null;
}

function normalizeAmount3818(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const fixed = value.toFixed(18).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  return fixed.length === 0 ? "0" : fixed;
}

async function estimateRealtimeWithdrawalBnbFee(
  sql: ReturnType<typeof getSql>,
  input: GasFeeQuoteInput,
): Promise<{ bnbAmount: string; details: Record<string, unknown> } | null> {
  if ((input.chain ?? "bsc") !== "bsc") return null;
  if (input.action !== "withdrawal_request" && input.action !== "user_transfer") return null;

  const cacheKey = `bsc:feeData`;
  const cachedFeeData = cacheGet<{ gasPrice?: bigint }>(cacheKey);
  let gasPriceFromProvider: bigint | undefined = cachedFeeData?.gasPrice;
  if (!gasPriceFromProvider) {
    const provider = getBscProvider();
    try {
      const timeoutMs = envInt("GAS_PROVIDER_TIMEOUT_MS", 1500);
      const feeData = await withTimeout(provider.getFeeData(), timeoutMs, "bsc.getFeeData");
      gasPriceFromProvider = feeData.gasPrice ?? undefined;
      cacheSet(cacheKey, { gasPrice: gasPriceFromProvider }, 10_000);
    } catch {
      gasPriceFromProvider = undefined;
    }
  }
  const fallbackGwei = Math.max(0.1, envNumber("GAS_BSC_FALLBACK_GWEI", 3));
  const gasPriceWei = gasPriceFromProvider ?? ethers.parseUnits(String(fallbackGwei), "gwei");

  const isNative = (input.assetSymbol ?? "").trim().toUpperCase() === "BNB";
  const gasUnits = (() => {
    if (input.action === "user_transfer") {
      return Math.max(21_000, envInt("GAS_BSC_TRANSFER_UNITS", 45_000));
    }
    return Math.max(
      21_000,
      envInt(isNative ? "GAS_BSC_NATIVE_UNITS" : "GAS_BSC_TOKEN_UNITS", isNative ? 21_000 : 65_000),
    );
  })();

  const multiplier = Math.max(1, envNumber("GAS_BSC_MULTIPLIER", 1.15));
  const bnbFee = Number(ethers.formatEther(gasPriceWei * BigInt(gasUnits))) * multiplier;

  const minBnb = Math.max(0, envNumber("GAS_MIN_BNB", 0));
  const maxBnb = Math.max(minBnb, envNumber("GAS_MAX_BNB", Number.POSITIVE_INFINITY));
  const bnbFinal = Math.min(maxBnb, Math.max(minBnb, bnbFee));
  const bnbAmount = normalizeAmount3818(bnbFinal);
  if (toBigInt3818(bnbAmount) === 0n) return null;

  return {
    bnbAmount,
    details: {
      gasPriceGwei: Number(ethers.formatUnits(gasPriceWei, "gwei")),
      gasUnits,
      multiplier,
      action: input.action,
    },
  };
}

async function bnbFeeToChargeInAsset(
  sql: ReturnType<typeof getSql>,
  bnbAmount: string,
  assetSymbol: string,
): Promise<{ chargeSymbol: string; chargeAmount: string; details: Record<string, unknown> } | null> {
  const sym = assetSymbol.trim().toUpperCase();
  if (!sym) return null;

  const bnbUsdt = await getUsdtPerUnit(sql, "BNB");
  if (!bnbUsdt) return null;

  const assetUsdt = sym === "BNB" ? bnbUsdt : await getUsdtPerUnit(sql, sym);
  if (!assetUsdt) return null;

  const bnb = Number(bnbAmount);
  if (!Number.isFinite(bnb) || bnb <= 0) return null;

  const feeUsdt = bnb * bnbUsdt.usdtPerUnit;
  const chargeAmountNum = feeUsdt / assetUsdt.usdtPerUnit;
  const chargeAmount = normalizeAmount3818(chargeAmountNum);
  if (toBigInt3818(chargeAmount) === 0n) return null;

  return {
    chargeSymbol: sym,
    chargeAmount,
    details: {
      bnbUsdt: bnbUsdt.usdtPerUnit,
      bnbUsdtSource: bnbUsdt.source,
      assetUsdt: assetUsdt.usdtPerUnit,
      assetUsdtSource: assetUsdt.source,
      feeUsdt,
      conversion: `${sym} via USDT`,
    },
  };
}

export async function quoteGasFee(
  sql: ReturnType<typeof getSql>,
  input: GasFeeQuoteInput,
): Promise<GasFeeQuote | GasChargeError> {
  const purpose: "display" | "charge" = input.purpose ?? "charge";
  const gasEnabled = envBool("GAS_ENABLED", false);
  const legacyGasSymbol = (process.env.GAS_TOKEN_SYMBOL ?? "BNB").trim() || "BNB";
  const burnBps = Math.max(0, Math.min(10_000, envInt("GAS_BURN_BPS", 25)));
  if (!gasEnabled) {
    // Charging disabled, but still return a stable display estimate (helps UX).
    // For BSC actions we display in native token (BNB).
    const isBnbDisplay = input.action === "withdrawal_request" || input.action === "user_transfer";
    const gasSymbol = isBnbDisplay ? "BNB" : legacyGasSymbol;

    let amount = "0";
    if (isBnbDisplay) {
      const key = input.action === "user_transfer" ? "GAS_USER_TRANSFER_FEE_BNB" : "GAS_ACTION_FEE_BNB";
      const fallbackKey = "GAS_ACTION_FEE_BNB";
      try {
        amount = envAmount3818(key, envAmount3818(fallbackKey, "0"));
      } catch {
        amount = "0";
      }
    }

    return { enabled: false, gasSymbol, amount, mode: "static", burnBps };
  }

  const feeMode = ((process.env.GAS_FEE_MODE ?? "realtime").trim().toLowerCase() === "static" ? "static" : "realtime") as
    | "static"
    | "realtime";
  const sponsoredIfInsufficient = shouldSponsorGasForAction(input.action);

  // Withdrawal gas: display in native token (BNB), charge in the withdrawn asset (option B).
  // User transfer gas: same display/charge scheme, but uses transfer-specific gas unit estimate.
  if (input.action === "withdrawal_request" || input.action === "user_transfer") {
    const displaySymbol = "BNB";
    let bnbAmount: string | null = null;
    let details: Record<string, unknown> = { sponsoredIfInsufficient };
    let mode: "static" | "realtime" = "static";

    if (feeMode === "realtime") {
      try {
        const live = await estimateRealtimeWithdrawalBnbFee(sql, input);
        if (live) {
          bnbAmount = live.bnbAmount;
          details = { ...details, ...live.details };
          mode = "realtime";
        }
      } catch {
        // fall back to static
      }
    }

    if (!bnbAmount) {
      const key = input.action === "user_transfer" ? "GAS_USER_TRANSFER_FEE_BNB" : "GAS_ACTION_FEE_BNB";
      const fallbackKey = "GAS_ACTION_FEE_BNB";
      try {
        bnbAmount = envAmount3818(key, envAmount3818(fallbackKey, "0"));
        details = { ...details, staticEnv: key === fallbackKey ? key : `${key} (fallback: ${fallbackKey})` };
      } catch {
        return { code: "gas_fee_invalid", details: { env: key } };
      }
    }

    if (toBigInt3818(bnbAmount) === 0n) {
      return { enabled: true, gasSymbol: displaySymbol, amount: "0", mode, burnBps, details };
    }

    if (purpose === "display") {
      return {
        enabled: true,
        gasSymbol: displaySymbol,
        amount: bnbAmount,
        mode,
        burnBps,
        details: { ...details, conversion: "skipped_for_display" },
      };
    }

    const assetSymbol = (input.assetSymbol ?? "").trim();
    if (assetSymbol) {
      const converted = await bnbFeeToChargeInAsset(sql, bnbAmount, assetSymbol);
      if (converted) {
        return {
          enabled: true,
          gasSymbol: displaySymbol,
          amount: bnbAmount,
          chargeSymbol: converted.chargeSymbol,
          chargeAmount: converted.chargeAmount,
          mode,
          burnBps,
          details: { ...details, ...converted.details },
        };
      }
    }

    return {
      enabled: true,
      gasSymbol: displaySymbol,
      amount: bnbAmount,
      mode,
      burnBps,
      details: { ...details, conversion: "unavailable" },
    };
  }

  const gasSymbol = legacyGasSymbol;

  let amount: string;
  try {
    amount = envAmount3818("GAS_ACTION_FEE_BNB", "0");
  } catch {
    return { code: "gas_fee_invalid", details: { env: "GAS_ACTION_FEE_BNB" } };
  }

  return {
    enabled: true,
    gasSymbol,
    amount,
    mode: "static",
    burnBps,
    details: { sponsoredIfInsufficient },
  };
}

export async function chargeGasFee(
  sql: ReturnType<typeof getSql>,
  input: ChargeGasFeeInput
): Promise<GasChargeError | null> {
  const quote = await quoteGasFee(sql, {
    action: input.action,
    chain: input.chain,
    assetSymbol: input.assetSymbol,
  });
  if ("code" in quote) return quote;
  if (!quote.enabled) return null;

  return await chargeGasFeeFromQuote(sql, input, quote);
}

export async function chargeGasFeeFromQuote(
  sql: ReturnType<typeof getSql>,
  input: ChargeGasFeeInput,
  quote: GasFeeQuote,
): Promise<GasChargeError | null> {
  if (!quote.enabled) return null;

  // Withdrawal fees: display in BNB, charge in the withdrawn asset.
  if (input.action === "withdrawal_request") {
    const chargeSymbol = (quote.chargeSymbol ?? input.assetSymbol ?? "").trim().toUpperCase();
    const chargeAmount = (quote.chargeAmount ?? "").trim();
    if (!chargeSymbol || !chargeAmount) {
      return {
        code: "gas_fee_invalid",
        details: {
          message: "missing_charge_amount",
          action: input.action,
          gasSymbol: quote.gasSymbol,
          amount: quote.amount,
        },
      };
    }

    const feeBig = toBigInt3818(chargeAmount);
    if (feeBig === 0n) return null;

    const burnBps = quote.burnBps;
    const burnBig = (feeBig * BigInt(burnBps)) / 10_000n;
    const treasuryBig = feeBig - burnBig;

    const assetId = await getAssetId(sql, chargeSymbol);
    if (!assetId) return { code: "gas_asset_not_found", details: { symbol: chargeSymbol } };

    await ensureSystemUser(sql, SYSTEM_TREASURY_USER_ID);
    await ensureSystemUser(sql, SYSTEM_BURN_USER_ID);

    const [userAcct, treasuryAcct, burnAcct] = await Promise.all([
      ensureLedgerAccount(sql, input.userId, assetId),
      ensureLedgerAccount(sql, SYSTEM_TREASURY_USER_ID, assetId),
      ensureLedgerAccount(sql, SYSTEM_BURN_USER_ID, assetId),
    ]);

    const available = await getAvailablePostedMinusHeld(sql, userAcct);
    const availableBig = toBigInt3818(available);
    if (availableBig < feeBig) {
      return {
        code: "insufficient_gas",
        details: {
          symbol: chargeSymbol,
          required: chargeAmount,
          available,
          action: input.action,
          display: { symbol: quote.gasSymbol, amount: quote.amount },
        },
      };
    }

    const reference = input.reference ?? input.action;

    const entryRows = await sql<{ id: string }[]>`
      INSERT INTO ex_journal_entry (type, reference, metadata_json)
      VALUES (
        'gas_fee',
        ${reference},
        ${sql.json({
          action: input.action,
          displaySymbol: quote.gasSymbol,
          displayAmount: quote.amount,
          chargeSymbol,
          chargeAmount,
          burnBps,
          quoteMode: quote.mode,
          quoteDetails: quote.details ?? null,
        } as any)}::jsonb
      )
      RETURNING id::text AS id
    `;
    const entryId = entryRows[0]!.id;

    const userDelta = fromBigInt3818(feeBig);
    const treasuryDelta = fromBigInt3818(treasuryBig);
    const burnDelta = fromBigInt3818(burnBig);

    if (treasuryBig > 0n && burnBig > 0n) {
      await sql`
        INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
        VALUES
          (${entryId}::uuid, ${userAcct}::uuid, ${assetId}::uuid, ((${userDelta}::numeric) * -1)),
          (${entryId}::uuid, ${treasuryAcct}::uuid, ${assetId}::uuid, (${treasuryDelta}::numeric)),
          (${entryId}::uuid, ${burnAcct}::uuid, ${assetId}::uuid, (${burnDelta}::numeric))
      `;
    } else if (treasuryBig > 0n) {
      await sql`
        INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
        VALUES
          (${entryId}::uuid, ${userAcct}::uuid, ${assetId}::uuid, ((${userDelta}::numeric) * -1)),
          (${entryId}::uuid, ${treasuryAcct}::uuid, ${assetId}::uuid, (${treasuryDelta}::numeric))
      `;
    } else {
      await sql`
        INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
        VALUES
          (${entryId}::uuid, ${userAcct}::uuid, ${assetId}::uuid, ((${userDelta}::numeric) * -1)),
          (${entryId}::uuid, ${burnAcct}::uuid, ${assetId}::uuid, (${burnDelta}::numeric))
      `;
    }

    if (burnBig > feeBig) {
      return { code: "gas_fee_invalid", details: { message: "burn exceeds fee" } };
    }
    sub3818NonNegative(fromBigInt3818(feeBig), fromBigInt3818(treasuryBig + burnBig));

    return null;
  }

  const gasSymbol = quote.gasSymbol;
  const feeAmount = quote.amount;

  const feeBig = toBigInt3818(feeAmount);
  if (feeBig === 0n) return null;

  const burnBps = quote.burnBps;
  const burnBig = (feeBig * BigInt(burnBps)) / 10_000n;
  const treasuryBig = feeBig - burnBig;

  const assetId = await getAssetId(sql, gasSymbol);
  if (!assetId) return { code: "gas_asset_not_found", details: { symbol: gasSymbol } };

  // Ensure system users exist for FK integrity.
  await ensureSystemUser(sql, SYSTEM_TREASURY_USER_ID);
  await ensureSystemUser(sql, SYSTEM_BURN_USER_ID);

  const [userAcct, treasuryAcct, burnAcct] = await Promise.all([
    ensureLedgerAccount(sql, input.userId, assetId),
    ensureLedgerAccount(sql, SYSTEM_TREASURY_USER_ID, assetId),
    ensureLedgerAccount(sql, SYSTEM_BURN_USER_ID, assetId),
  ]);

  const available = await getAvailablePostedMinusHeld(sql, userAcct);
  const availableBig = toBigInt3818(available);
  if (availableBig < feeBig) {
    if (shouldSponsorGasForAction(input.action)) {
      return null;
    }
    return {
      code: "insufficient_gas",
      details: {
        symbol: gasSymbol,
        required: feeAmount,
        available,
        action: input.action,
      },
    };
  }

  const reference = input.reference ?? input.action;

  const entryRows = await sql<{ id: string }[]>`
    INSERT INTO ex_journal_entry (type, reference, metadata_json)
    VALUES (
      'gas_fee',
      ${reference},
      ${sql.json({
        action: input.action,
        symbol: gasSymbol,
        feeAmount,
        burnBps,
      })}::jsonb
    )
    RETURNING id::text AS id
  `;
  const entryId = entryRows[0]!.id;

  const userDelta = fromBigInt3818(feeBig);
  const treasuryDelta = fromBigInt3818(treasuryBig);
  const burnDelta = fromBigInt3818(burnBig);

  // Double-entry: user pays fee; treasury receives non-burn portion; burn sink receives burned portion.
  // Avoid inserting any zero-amount lines (DB constraint: amount <> 0).
  if (treasuryBig > 0n && burnBig > 0n) {
    await sql`
      INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
      VALUES
        (${entryId}::uuid, ${userAcct}::uuid, ${assetId}::uuid, ((${userDelta}::numeric) * -1)),
        (${entryId}::uuid, ${treasuryAcct}::uuid, ${assetId}::uuid, (${treasuryDelta}::numeric)),
        (${entryId}::uuid, ${burnAcct}::uuid, ${assetId}::uuid, (${burnDelta}::numeric))
    `;
  } else if (treasuryBig > 0n) {
    await sql`
      INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
      VALUES
        (${entryId}::uuid, ${userAcct}::uuid, ${assetId}::uuid, ((${userDelta}::numeric) * -1)),
        (${entryId}::uuid, ${treasuryAcct}::uuid, ${assetId}::uuid, (${treasuryDelta}::numeric))
    `;
  } else {
    await sql`
      INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
      VALUES
        (${entryId}::uuid, ${userAcct}::uuid, ${assetId}::uuid, ((${userDelta}::numeric) * -1)),
        (${entryId}::uuid, ${burnAcct}::uuid, ${assetId}::uuid, (${burnDelta}::numeric))
    `;
  }

  // Sanity: ensures we didn\'t underflow due to rounding.
  // (Not strictly required; included as a defensive invariant.)
  if (burnBig > feeBig) {
    return { code: "gas_fee_invalid", details: { message: "burn exceeds fee" } };
  }
  // Ensure treasury+burn == fee
  // (BigInt math already guarantees it, but keep logic explicit.)
  sub3818NonNegative(fromBigInt3818(feeBig), fromBigInt3818(treasuryBig + burnBig));

  return null;
}
