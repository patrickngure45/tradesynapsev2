import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";

import { getSql } from "@/lib/db";
import { requireAdminForApi } from "@/lib/auth/admin";
import { apiError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TOKENLIST_URL = "https://tokens.pancakeswap.finance/pancakeswap-extended.json";

const inputSchema = z.object({
  confirm: z.literal("SEED_ASSETS"),
  tokenlist_url: z.string().url().optional().default(DEFAULT_TOKENLIST_URL),
  limit: z.number().int().min(1).max(500).optional().default(300),
  require_icon: z.boolean().optional().default(true),
  allow_generic_icon: z.boolean().optional().default(false),
  create_markets: z.boolean().optional().default(true),
});

function findIconsDir(): string {
  // Same icon pack as /api/assets/icon
  return path.join(process.cwd(), "node_modules", "cryptocurrency-icons", "svg", "color");
}

async function loadLocalIconSet(): Promise<Set<string>> {
  try {
    const dir = findIconsDir();
    const files = await fs.readdir(dir);
    const set = new Set<string>();
    for (const f of files) {
      const lower = String(f || "").toLowerCase();
      if (!lower.endsWith(".svg")) continue;
      set.add(lower.slice(0, -4));
    }
    return set;
  } catch {
    return new Set();
  }
}

function normalizeAddress(v: string): string {
  return String(v || "").trim().toLowerCase();
}

function normalizeSymbol(v: string): string {
  return String(v || "").trim().toUpperCase();
}

function normalizeName(v: string): string {
  return String(v || "").trim();
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`tokenlist_fetch_failed status=${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

async function ensureSystemUser(sql: ReturnType<typeof getSql>) {
  await sql`
    INSERT INTO app_user (id, status, kyc_level, country)
    VALUES (${SYSTEM_USER_ID}::uuid, 'active', 'none', NULL)
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function POST(req: NextRequest) {
  const sql = getSql();

  const admin = await requireAdminForApi(sql, req);
  if (!admin.ok) return admin.response;

  const body = await req.json().catch(() => ({}));
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return apiError("invalid_input", { status: 400, details: parsed.error.flatten() });

  const { tokenlist_url, limit, require_icon, allow_generic_icon, create_markets } = parsed.data;

  try {
    const tokenlist = await fetchJsonWithTimeout(tokenlist_url, 15_000);
    const tokensRaw = Array.isArray(tokenlist?.tokens) ? (tokenlist.tokens as any[]) : [];

    const candidates: Array<{
      symbol: string;
      name: string;
      address: string;
      decimals: number;
      chainId: number;
    }> = [];

    for (const t of tokensRaw) {
      const chainId = Number(t?.chainId);
      if (chainId !== 56) continue;
      const address = normalizeAddress(String(t?.address ?? ""));
      const symbol = normalizeSymbol(String(t?.symbol ?? ""));
      const name = normalizeName(String(t?.name ?? "")) || symbol;
      const decimals = Number(t?.decimals);

      if (!address.startsWith("0x") || address.length !== 42) continue;
      if (!symbol || symbol.length < 2 || symbol.length > 16) continue;
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) continue;

      candidates.push({ symbol, name, address, decimals, chainId });
    }

    // Priority: core rails first.
    const priority = ["USDT", "USDC", "WBNB", "BUSD", "DAI", "FDUSD", "BTCB", "ETH"];
    candidates.sort((a, b) => {
      const ai = priority.indexOf(a.symbol);
      const bi = priority.indexOf(b.symbol);
      const ap = ai === -1 ? 9_999 : ai;
      const bp = bi === -1 ? 9_999 : bi;
      if (ap !== bp) return ap - bp;
      return a.symbol.localeCompare(b.symbol);
    });

    const iconSet = require_icon ? await loadLocalIconSet() : new Set<string>();

    const picked: typeof candidates = [];
    const seenAddr = new Set<string>();
    for (const c of candidates) {
      if (picked.length >= limit) break;
      if (seenAddr.has(c.address)) continue;
      if (require_icon) {
        // Only keep coins with a local icon available in the pack.
        // This matches your UI requirement (no external logo fetch).
        const ok = iconSet.has(c.symbol.toLowerCase());
        if (!ok && !allow_generic_icon) continue;
      }
      seenAddr.add(c.address);
      picked.push(c);
    }

    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;
      await ensureSystemUser(txSql as any);

      // Ensure native BNB exists (required for native deposit crediting).
      await txSql`
        INSERT INTO ex_asset (chain, symbol, name, contract_address, decimals, is_enabled)
        VALUES ('bsc', 'BNB', 'BNB', NULL, 18, true)
        ON CONFLICT (chain, symbol)
        DO UPDATE SET contract_address = NULL, decimals = 18, is_enabled = true
      `;

      const existing = await txSql<{ symbol: string; contract_address: string | null }[]>`
        SELECT upper(symbol) AS symbol, contract_address
        FROM ex_asset
        WHERE chain = 'bsc'
      `;
      const symbolToContract = new Map<string, string | null>();
      for (const row of existing) symbolToContract.set(String(row.symbol), row.contract_address ? normalizeAddress(row.contract_address) : null);

      let inserted = 0;
      let updated = 0;
      let skippedSymbolCollision = 0;
      const skipped: Array<{ symbol: string; reason: string }> = [];

      for (const c of picked) {
        const prevContract = symbolToContract.get(c.symbol);
        if (prevContract && prevContract !== c.address) {
          skippedSymbolCollision += 1;
          skipped.push({ symbol: c.symbol, reason: "symbol_collision" });
          continue;
        }

        const up = await txSql`
          INSERT INTO ex_asset (chain, symbol, name, contract_address, decimals, is_enabled)
          VALUES ('bsc', ${c.symbol}, ${c.name}, ${c.address}, ${c.decimals}, true)
          ON CONFLICT (chain, contract_address)
          DO UPDATE SET symbol = EXCLUDED.symbol, name = EXCLUDED.name, decimals = EXCLUDED.decimals, is_enabled = true
        `;

        // postgres.js returns a command count on result.count
        if ((up as any)?.count && Number((up as any).count) > 0) {
          // Could be insert or update; we conservatively treat as update if symbol existed.
          if (symbolToContract.has(c.symbol)) updated += 1;
          else inserted += 1;
        } else {
          // Fallback if driver doesn't expose count.
          if (symbolToContract.has(c.symbol)) updated += 1;
          else inserted += 1;
        }

        symbolToContract.set(c.symbol, c.address);
      }

      let marketsCreated = 0;
      if (create_markets) {
        const r = await txSql`
          INSERT INTO ex_market (chain, symbol, base_asset_id, quote_asset_id, status)
          SELECT
            'bsc',
            (upper(base.symbol) || '/USDT')::text,
            base.id,
            quote.id,
            'enabled'
          FROM ex_asset base
          JOIN ex_asset quote
            ON quote.chain = 'bsc' AND upper(quote.symbol) = 'USDT' AND quote.is_enabled = true
          WHERE base.chain = 'bsc'
            AND base.is_enabled = true
            AND upper(base.symbol) <> 'USDT'
          ON CONFLICT (chain, symbol) DO NOTHING
        `;
        marketsCreated = Number((r as any)?.count ?? 0) || 0;
      }

      return {
        ok: true as const,
        tokenlist_url,
        requested_limit: limit,
        picked: picked.length,
        inserted,
        updated,
        skipped_symbol_collision: skippedSymbolCollision,
        markets_created: marketsCreated,
        skipped: skipped.slice(0, 25),
      };
    });

    return NextResponse.json(result);
  } catch (e) {
    const resp = responseForDbError("admin.assets.seed", e);
    if (resp) return resp;
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
