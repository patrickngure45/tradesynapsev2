import "dotenv/config";

import { appendFileSync, existsSync, readFileSync } from "node:fs";

type BalanceRow = {
  asset_id: string;
  chain: string;
  symbol: string;
  decimals: number;
  posted: string;
  held: string;
  available: string;
};

type MarketsOverviewMarket = {
  chain: string;
  symbol: string;
  base_symbol: string;
  quote_symbol: string;
  stats?: {
    last?: string | null;
  } | null;
};

type MarketsOverviewResponse = {
  markets: MarketsOverviewMarket[];
};

type ConvertQuoteResponse =
  | {
      ok: true;
      quote: {
        fromSymbol: string;
        toSymbol: string;
        rateToPerFrom: string;
        priceSource: {
          kind: "external_index_usdt" | "internal_fx" | "anchor";
          fromUsdt: number;
          toUsdt: number;
        };
      };
    }
  | { error: string; details?: unknown };

type BalancesResponse = {
  user_id: string;
  balances: BalanceRow[];
};

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function usage(): never {
  console.error(
    [
      "Usage: tsx scripts/bulk-transfer-usdt-value-via-api.ts ",
      "  --recipient <email>",
      "  [--usdt 5000] [--chain bsc]",
      "  [--base-url http://Janjaa:3000] [--origin http://Janjaa:3000]",
      "  [--acting-user-id <uuid>]",
      "  [--limit N] [--resume-from-symbol SYMBOL] [--out path] [--dry-run]",
      "  [--balances-file path] [--skip-overview]",
      "\n\nBehavior:",
      "- Uses API endpoints (no direct DB connection).",
      "- Only transfers assets where acting user has available > 0.",
      "- Prices assets in USDT using latest market execution price:",
      "  - direct ASSET/USDT or USDT/ASSET, else",
      "  - via convert.quote endpoint when direct market price isn't available.",
      "- Retries transient 503 db outages with exponential backoff.",
    ].join("\n"),
  );
  process.exit(2);
}

function n(v: unknown): number | null {
  const x = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(x) ? x : null;
}

function formatAmount3818(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const fixed = value
    .toFixed(18)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
  return fixed.length ? fixed : "0";
}

async function fetchJson<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const timeoutMs = init?.timeoutMs ?? 15_000;
  const { timeoutMs: _timeoutMs, ...rest } = init ?? {};
  const res = await fetch(url, { ...rest, signal: rest.signal ?? AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTextWithRetry(
  url: string,
  init: RequestInit,
  opts: { maxRetries: number; baseDelayMs: number; label: string; timeoutMs?: number },
): Promise<{ ok: boolean; status: number; text: string }> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(opts.timeoutMs ?? 15_000) });
      const text = await res.text().catch(() => "");

      if (res.status === 503 && attempt < opts.maxRetries) {
        const delay = Math.min(15_000, opts.baseDelayMs * 2 ** attempt);
        console.log(`[retry] ${opts.label} HTTP 503; sleeping ${delay}ms (attempt ${attempt + 1}/${opts.maxRetries})`);
        await sleepMs(delay);
        attempt++;
        continue;
      }

      return { ok: res.ok, status: res.status, text };
    } catch (e) {
      if (attempt >= opts.maxRetries) {
        return { ok: false, status: 0, text: e instanceof Error ? e.message : String(e) };
      }
      const delay = Math.min(15_000, opts.baseDelayMs * 2 ** attempt);
      console.log(`[retry] ${opts.label} network error; sleeping ${delay}ms (attempt ${attempt + 1}/${opts.maxRetries})`);
      await sleepMs(delay);
      attempt++;
    }
  }
}

async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit,
  opts: { maxRetries: number; baseDelayMs: number; label: string; timeoutMs?: number },
): Promise<T> {
  const r = await fetchTextWithRetry(url, init, opts);
  if (!r.ok) {
    throw new Error(`HTTP ${r.status} for ${url}: ${r.text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(r.text) as T;
  } catch {
    throw new Error(`Invalid JSON for ${url}: ${r.text.slice(0, 200)}`);
  }
}

function buildLastPriceMaps(markets: MarketsOverviewMarket[], chain: string) {
  // Returns:
  // - directUsdt: symbol -> USDT per 1 symbol
  const directUsdt = new Map<string, number>();

  for (const m of markets) {
    if ((m.chain ?? "").toLowerCase() !== chain) continue;

    const base = (m.base_symbol ?? "").trim().toUpperCase();
    const quote = (m.quote_symbol ?? "").trim().toUpperCase();
    const last = n(m.stats?.last ?? null);
    if (!last || last <= 0) continue;

    if (quote === "USDT") {
      // ASSET/USDT where price = USDT per 1 ASSET
      directUsdt.set(base, last);
    } else if (base === "USDT") {
      // USDT/ASSET where price = ASSET per 1 USDT -> invert to get USDT per 1 ASSET
      directUsdt.set(quote, 1 / last);
    }
  }

  return { directUsdt };
}

async function usdtPerSymbolViaConvert(args: {
  baseUrl: string;
  origin: string;
  actingUserId: string;
  fromSymbol: string;
}): Promise<number | null> {
  const sym = args.fromSymbol.trim().toUpperCase();
  if (!sym) return null;
  if (sym === "USDT") return 1;

  const url = `${args.baseUrl}/api/exchange/convert/quote?from=${encodeURIComponent(sym)}&to=USDT&amount_in=1`;
  const r = await fetchTextWithRetry(
    url,
    {
      headers: {
        Origin: args.origin,
        "x-user-id": args.actingUserId,
      },
    },
    { maxRetries: 6, baseDelayMs: 500, label: `convert.quote ${sym}->USDT` },
  );

  if (!r.ok) {
    // 409 quote_unavailable is expected for many symbols.
    return null;
  }

  let parsed: ConvertQuoteResponse;
  try {
    parsed = JSON.parse(r.text) as ConvertQuoteResponse;
  } catch {
    return null;
  }

  if (!(parsed as any)?.ok) return null;
  const q = (parsed as any).quote as any;

  const px = Number(q?.priceSource?.fromUsdt);
  if (Number.isFinite(px) && px > 0) return px;
  return null;
}

async function main() {
  const recipient = (argValue("--recipient") ?? "").trim();
  if (!recipient) usage();

  const chain = (argValue("--chain") ?? "bsc").trim().toLowerCase();
  const usdtValue = Number(argValue("--usdt") ?? "5000");
  const baseUrl = (argValue("--base-url") ?? "http://Janjaa:3000").trim().replace(/\/$/, "");
  const origin = (argValue("--origin") ?? baseUrl).trim();
  const actingUserId = (argValue("--acting-user-id") ?? "4aa78411-8d40-4f22-9c68-5cba27f1666a").trim();
  const limit = Math.max(0, Math.min(10_000, Number(argValue("--limit") ?? "0") || 0));
  const resumeFromSymbol = (argValue("--resume-from-symbol") ?? "").trim().toUpperCase();
  const outPath = (argValue("--out") ?? "").trim();
  const dryRun = hasFlag("--dry-run");
  const balancesFile = (argValue("--balances-file") ?? "").trim();
  const skipOverview = hasFlag("--skip-overview");

  if (!Number.isFinite(usdtValue) || usdtValue <= 0) {
    throw new Error(`Invalid --usdt value: ${String(argValue("--usdt"))}`);
  }

  const balancesUrl = `${baseUrl}/api/exchange/balances`;
  const overviewUrl = `${baseUrl}/api/exchange/markets/overview?fiat=USD`;

  const headersBase = {
    Origin: origin,
    "x-user-id": actingUserId,
  } as Record<string, string>;

  let balancesResp: BalancesResponse;
  try {
    balancesResp = await fetchJsonWithRetry<BalancesResponse>(
      balancesUrl,
      { headers: headersBase },
      { maxRetries: 4, baseDelayMs: 750, label: "balances", timeoutMs: 15_000 },
    );
  } catch (e) {
    if (balancesFile && existsSync(balancesFile)) {
      console.log(`[warn] balances endpoint unavailable; using balances snapshot file: ${balancesFile}`);
      balancesResp = JSON.parse(readFileSync(balancesFile, { encoding: "utf8" })) as BalancesResponse;
    } else {
      throw e;
    }
  }

  let overviewResp: MarketsOverviewResponse = { markets: [] };
  if (!skipOverview) {
    try {
      overviewResp = await fetchJsonWithRetry<MarketsOverviewResponse>(
        overviewUrl,
        { headers: headersBase },
        { maxRetries: 3, baseDelayMs: 750, label: "markets.overview", timeoutMs: 20_000 },
      );
    } catch {
      console.log("[warn] markets overview unavailable; will price via convert.quote only.");
    }
  }

  const balances = balancesResp.balances
    .filter((b) => (b.chain ?? "").toLowerCase() === chain)
    .filter((b) => (n(b.available) ?? 0) > 0);

  balances.sort((a, b) => a.symbol.localeCompare(b.symbol));

  const { directUsdt } = buildLastPriceMaps(overviewResp.markets, chain);

  console.log(
    JSON.stringify(
      {
        baseUrl,
        origin,
        chain,
        recipient,
        actingUserId,
        usdtValue,
        balancesWithAvailable: balances.length,
        directUsdtPricesFromExecutions: directUsdt.size,
        resumeFromSymbol: resumeFromSymbol || null,
        out: outPath || null,
        dryRun,
        limit,
        balancesFile: balancesFile || null,
        skipOverview,
      },
      null,
      2,
    ),
  );

  const transferUrl = `${baseUrl}/api/exchange/transfers/request`;

  let processed = 0;
  let ok = 0;
  let skippedNoPrice = 0;
  let failed = 0;

  const priceCache = new Map<string, number>();

  const out = outPath || `/d/final/.tmp/bulk-transfer-${Date.now()}.jsonl`;
  const emit = (obj: unknown) => {
    try {
      appendFileSync(out, `${JSON.stringify(obj)}\n`, { encoding: "utf8" });
    } catch {
      // non-blocking
    }
  };

  const alreadyOk = new Set<string>();
  try {
    if (existsSync(out)) {
      const raw = readFileSync(out, { encoding: "utf8" });
      for (const line of raw.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as any;
          if (obj?.status === "ok" && typeof obj?.symbol === "string") {
            alreadyOk.add(String(obj.symbol).toUpperCase());
          }
        } catch {
          // ignore malformed lines
        }
      }
    }
  } catch {
    // non-blocking
  }

  for (const b of balances) {
    if (limit > 0 && processed >= limit) break;

    const symbol = b.symbol.trim().toUpperCase();
    if (alreadyOk.has(symbol)) {
      continue;
    }
    if (resumeFromSymbol && symbol < resumeFromSymbol) {
      continue;
    }

    processed++;

    // Determine USDT per 1 unit
    let pxUsdt: number | null = priceCache.get(symbol) ?? null;
    if (pxUsdt == null) {
      // Prefer execution-derived direct USDT price if available, else fall back to convert quote.
      pxUsdt = symbol === "USDT" ? 1 : directUsdt.get(symbol) ?? null;
      if (pxUsdt == null) {
        const viaConvert = await usdtPerSymbolViaConvert({
          baseUrl,
          origin,
          actingUserId,
          fromSymbol: symbol,
        });
        pxUsdt = viaConvert;
      }
      if (pxUsdt != null) priceCache.set(symbol, pxUsdt);
    }

    if (pxUsdt == null || !Number.isFinite(pxUsdt) || pxUsdt <= 0) {
      skippedNoPrice++;
      emit({ ts: new Date().toISOString(), symbol, asset_id: b.asset_id, status: "skipped_no_price" });
      continue;
    }

    const amountNum = symbol === "USDT" ? usdtValue : usdtValue / pxUsdt;
    const amount = formatAmount3818(amountNum);
    if (amount === "0") {
      failed++;
      console.log(`[error] ${symbol}: computed amount=0 (pxUsdt=${pxUsdt})`);
      continue;
    }

    const reference = `bulk:${symbol}:${usdtValue}usdt:${new Date().toISOString()}`;

    if (dryRun) {
      console.log(`[dry-run] ${symbol} px_usdt=${pxUsdt} amount=${amount} available=${b.available}`);
      ok++;
      emit({ ts: new Date().toISOString(), symbol, asset_id: b.asset_id, status: "dry_run", px_usdt: pxUsdt, amount });
      continue;
    }

    const r = await fetchTextWithRetry(
      transferUrl,
      {
        method: "POST",
        headers: {
          ...headersBase,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          asset_id: b.asset_id,
          amount,
          recipient_email: recipient,
          reference,
        }),
      },
        { maxRetries: 8, baseDelayMs: 750, label: `transfer ${symbol}`, timeoutMs: 30_000 },
    );

    if (!r.ok) {
      failed++;
      console.log(`[fail] ${symbol} HTTP ${r.status}: ${r.text.slice(0, 300)}`);
      emit({ ts: new Date().toISOString(), symbol, asset_id: b.asset_id, status: "fail", http_status: r.status, body: r.text.slice(0, 2000) });
    } else {
      ok++;
      let transferId: string | null = null;
      let fee: string | null = null;
      try {
        const parsed = JSON.parse(r.text) as any;
        transferId = parsed?.transfer?.id ?? null;
        fee = parsed?.transfer?.fees?.transfer_fee_asset_amount ?? null;
      } catch {
        // ignore
      }
      console.log(`[ok] ${symbol} transfer_id=${transferId} amount=${amount} fee=${fee}`);
      emit({ ts: new Date().toISOString(), symbol, asset_id: b.asset_id, status: "ok", transfer_id: transferId, amount, px_usdt: pxUsdt, fee });
    }

    if (processed % 10 === 0) {
      console.log(`[progress] processed=${processed} ok=${ok} failed=${failed} skipped_no_price=${skippedNoPrice}`);
    }
  }

  console.log(
    JSON.stringify(
      { processed, ok, failed, skipped_no_price: skippedNoPrice, finishedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
