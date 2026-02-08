import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z
  .object({
    chain: z.literal("bsc").optional().default("bsc"),
    tst_contract: z.string().min(1).optional(),
    usdt_contract: z.string().min(1).optional(),
  })
  .optional();

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return apiError("not_found");
  }

  const sql = getSql();
  const body = await request.json().catch(() => ({}));
  let input: z.infer<NonNullable<typeof inputSchema>> | undefined;
  try {
    input = inputSchema.parse(body);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    const chain = input?.chain ?? "bsc";
    const tst = input?.tst_contract ?? null;
    const usdt = input?.usdt_contract ?? null;

    // Insert BNB (native)
    await sql`
      INSERT INTO ex_asset (chain, symbol, name, contract_address, decimals, is_enabled)
      VALUES (${chain}, 'BNB', 'BNB', NULL, 18, true)
      ON CONFLICT (chain, symbol) DO NOTHING
    `;

    if (usdt) {
      await sql`
        INSERT INTO ex_asset (chain, symbol, name, contract_address, decimals, is_enabled)
        VALUES (${chain}, 'USDT', 'Tether USD', ${usdt}, 18, true)
        ON CONFLICT (chain, symbol) DO UPDATE SET contract_address = EXCLUDED.contract_address
      `;
    } else {
      await sql`
        INSERT INTO ex_asset (chain, symbol, name, contract_address, decimals, is_enabled)
        VALUES (${chain}, 'USDT', 'Tether USD', NULL, 18, true)
        ON CONFLICT (chain, symbol) DO NOTHING
      `;
    }

    if (tst) {
      await sql`
        INSERT INTO ex_asset (chain, symbol, name, contract_address, decimals, is_enabled)
        VALUES (${chain}, 'TST', 'TradeSynapse Token', ${tst}, 18, true)
        ON CONFLICT (chain, symbol) DO UPDATE SET contract_address = EXCLUDED.contract_address
      `;
    } else {
      await sql`
        INSERT INTO ex_asset (chain, symbol, name, contract_address, decimals, is_enabled)
        VALUES (${chain}, 'TST', 'TradeSynapse Token', NULL, 18, true)
        ON CONFLICT (chain, symbol) DO NOTHING
      `;
    }

    const assets = await sql<{ symbol: string; contract_address: string | null }[]>`
      SELECT symbol, contract_address
      FROM ex_asset
      WHERE chain = ${chain}
      ORDER BY symbol ASC
    `;

    return Response.json({ ok: true, assets });
  } catch (e) {
    const resp = responseForDbError("exchange.dev.seed_assets", e);
    if (resp) return resp;
    throw e;
  }
}
