import { NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { getBscProvider } from "@/lib/blockchain/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeAddress(addr: string): string {
  return String(addr || "").trim().toLowerCase();
}

function isHexTxHash(v: string): boolean {
  const s = String(v || "").trim();
  return /^0x[0-9a-fA-F]{64}$/.test(s);
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

type DepositEventRow = {
  id: number;
  chain: string;
  tx_hash: string;
  log_index: number;
  block_number: number;
  from_address: string | null;
  to_address: string;
  user_id: string;
  asset_id: string;
  asset_symbol: string;
  amount: string;
  journal_entry_id: string | null;
  created_at: string;
};

type JournalLineRow = {
  entry_id: string;
  account_id: string;
  user_id: string;
  asset_id: string;
  amount: string;
};

export async function GET(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql as any, request);
  if (!admin.ok) return admin.response;

  const url = new URL(request.url);
  const chain = (url.searchParams.get("chain") ?? "bsc").trim().toLowerCase();
  const addressRaw = url.searchParams.get("address") ?? "";
  const txHashRaw = url.searchParams.get("tx_hash") ?? url.searchParams.get("tx") ?? "";
  const txHash = txHashRaw.trim();
  const address = normalizeAddress(addressRaw);

  const limit = clampInt(Number(url.searchParams.get("limit") ?? "20"), 1, 200);

  if (chain !== "bsc") {
    return NextResponse.json(
      { ok: false, error: "unsupported_chain", hint: "Only chain=bsc is supported right now." },
      { status: 400 },
    );
  }

  if (!address && !txHash) {
    return NextResponse.json(
      { ok: false, error: "missing_query", hint: "Provide address=0x... and/or tx_hash=0x..." },
      { status: 400 },
    );
  }

  if (txHash && !isHexTxHash(txHash)) {
    return NextResponse.json(
      { ok: false, error: "invalid_tx_hash" },
      { status: 400 },
    );
  }

  try {
    const provider = getBscProvider();

    const [tip, onChain] = await Promise.all([
      provider.getBlockNumber(),
      (async () => {
        if (!txHash) return null;
        const receipt = await provider.getTransactionReceipt(txHash);
        const tx = await provider.getTransaction(txHash);
        if (!receipt && !tx) return { found: false as const };

        const to = tx?.to ? normalizeAddress(tx.to) : "";
        const value = typeof tx?.value === "bigint" ? tx.value : 0n;

        return {
          found: true as const,
          tx_hash: txHash,
          status: typeof receipt?.status === "number" ? receipt.status : null,
          block_number: receipt?.blockNumber != null ? Number(receipt.blockNumber) : null,
          from: tx?.from ? normalizeAddress(tx.from) : null,
          to: to || null,
          value_wei: value.toString(),
        };
      })(),
    ]);

    const resolvedToAddress = normalizeAddress(
      address || (onChain && onChain.found && onChain.to ? onChain.to : ""),
    );

    const depositAddress = resolvedToAddress
      ? await retryOnceOnTransientDbError(async () => {
          const rows = await sql<
            { user_id: string; address: string; status: string | null; created_at: string }[]
          >`
            SELECT user_id::text AS user_id, address, status, created_at::text AS created_at
            FROM ex_deposit_address
            WHERE chain = 'bsc'
              AND lower(address) = ${resolvedToAddress}
            LIMIT 1
          `;
          return rows[0] ?? null;
        })
      : null;

    const events = await retryOnceOnTransientDbError(async () => {
      if (txHash) {
        return await sql<DepositEventRow[]>`
          SELECT
            e.id,
            e.chain,
            e.tx_hash,
            e.log_index,
            e.block_number,
            e.from_address,
            e.to_address,
            e.user_id::text AS user_id,
            e.asset_id::text AS asset_id,
            a.symbol AS asset_symbol,
            e.amount::text AS amount,
            e.journal_entry_id::text AS journal_entry_id,
            e.created_at::text AS created_at
          FROM ex_chain_deposit_event e
          JOIN ex_asset a ON a.id = e.asset_id
          WHERE e.chain = 'bsc'
            AND e.tx_hash = ${txHash}
          ORDER BY e.log_index ASC
          LIMIT ${limit}
        `;
      }

      return await sql<DepositEventRow[]>`
        SELECT
          e.id,
          e.chain,
          e.tx_hash,
          e.log_index,
          e.block_number,
          e.from_address,
          e.to_address,
          e.user_id::text AS user_id,
          e.asset_id::text AS asset_id,
          a.symbol AS asset_symbol,
          e.amount::text AS amount,
          e.journal_entry_id::text AS journal_entry_id,
          e.created_at::text AS created_at
        FROM ex_chain_deposit_event e
        JOIN ex_asset a ON a.id = e.asset_id
        WHERE e.chain = 'bsc'
          AND lower(e.to_address) = ${resolvedToAddress}
        ORDER BY e.block_number DESC, e.id DESC
        LIMIT ${limit}
      `;
    });

    const journalEntryIds = Array.from(new Set(events.map((e) => e.journal_entry_id).filter(Boolean))) as string[];

    const journalLines = journalEntryIds.length
      ? await retryOnceOnTransientDbError(async () => {
          return await sql<JournalLineRow[]>`
            SELECT
              jl.entry_id::text AS entry_id,
              jl.account_id::text AS account_id,
              la.user_id::text AS user_id,
              jl.asset_id::text AS asset_id,
              jl.amount::text AS amount
            FROM ex_journal_line jl
            JOIN ex_ledger_account la ON la.id = jl.account_id
            WHERE jl.entry_id = ANY(${journalEntryIds}::uuid[])
            ORDER BY jl.entry_id ASC, jl.amount DESC
          `;
        })
      : ([] as JournalLineRow[]);

    const credited = events.some((e) => Boolean(e.journal_entry_id));

    return NextResponse.json({
      ok: true,
      chain: "bsc",
      tip,
      query: {
        address: resolvedToAddress || null,
        tx_hash: txHash || null,
      },
      deposit_address: depositAddress
        ? {
            found: true,
            user_id: depositAddress.user_id,
            address: normalizeAddress(depositAddress.address),
            status: depositAddress.status ?? null,
            created_at: depositAddress.created_at,
          }
        : { found: false },
      onchain: onChain,
      events,
      credited,
      journal_lines: journalLines,
    });
  } catch (e) {
    // Keep errors consistent with other admin APIs.
    const message = e instanceof Error ? e.message : String(e);
    return apiError("internal_error", { details: { message } });
  }
}
