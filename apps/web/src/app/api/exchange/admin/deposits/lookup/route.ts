import { NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { ethers } from "ethers";
import { getBscReadProvider } from "@/lib/blockchain/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeAddress(addr: string): string {
  return String(addr || "").trim().toLowerCase();
}

function isHexTxHash(v: string): boolean {
  const s = String(v || "").trim();
  return /^0x[0-9a-fA-F]{64}$/.test(s);
}

const TRANSFER_TOPIC0 = ethers.id("Transfer(address,address,uint256)");
const transferIface = new ethers.Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

async function bestEffortIsContract(provider: ethers.Provider, address: string | null | undefined): Promise<boolean | null> {
  const addr = String(address ?? "").trim();
  if (!addr) return null;
  try {
    const code = await provider.getCode(addr);
    if (!code) return null;
    return String(code).toLowerCase() !== "0x";
  } catch {
    return null;
  }
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function envInt(name: string, fallback: number): number {
  const raw = String(process.env[name] ?? "").trim();
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
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
    const provider = getBscReadProvider();

    const confirmationsRequired = clampInt(envInt("BSC_DEPOSIT_CONFIRMATIONS", 2), 0, 200);

    const [tip, cursorRow, onChain] = await Promise.all([
      provider.getBlockNumber(),
      retryOnceOnTransientDbError(async () => {
        const rows = await sql<{ last_scanned_block: number }[]>`
          SELECT last_scanned_block
          FROM ex_chain_deposit_cursor
          WHERE chain = 'bsc'
          LIMIT 1
        `;
        return rows[0] ?? null;
      }),
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
          receipt,
        };
      })(),
    ]);

    const resolvedToAddress = normalizeAddress(
      address || (onChain && onChain.found && onChain.to ? onChain.to : ""),
    );

    const txToIsContract =
      onChain && (onChain as any).found && (onChain as any).to
        ? await bestEffortIsContract(provider, String((onChain as any).to))
        : null;

    const safeTip = Math.max(0, tip - confirmationsRequired);
    const cursorLast = cursorRow ? Number(cursorRow.last_scanned_block ?? 0) : 0;
    const cursorLagBlocks = Math.max(0, safeTip - cursorLast);

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

    // Best-effort matches for admin visibility.
    const resolvedDepositAddress = depositAddress ? normalizeAddress(depositAddress.address) : resolvedToAddress;
    const nativeMatch = Boolean(
      onChain && (onChain as any).found && (onChain as any).to && normalizeAddress(String((onChain as any).to)) === resolvedDepositAddress &&
        BigInt(String((onChain as any).value_wei ?? "0")) > 0n,
    );

    const tokenMatches: Array<{ contract: string; value_wei: string; log_index: number | null }> = [];
    try {
      const receipt = (onChain as any)?.receipt as any;
      if (receipt && Array.isArray(receipt.logs) && resolvedDepositAddress) {
        for (const log of receipt.logs as Array<any>) {
          const topic0 = String(log?.topics?.[0] ?? "");
          if (topic0 !== TRANSFER_TOPIC0) continue;
          try {
            const decoded = transferIface.decodeEventLog("Transfer", log.data, log.topics);
            const to = decoded?.to ? normalizeAddress(String(decoded.to)) : "";
            if (!to || to !== resolvedDepositAddress) continue;
            const value = typeof decoded?.value === "bigint" ? (decoded.value as bigint) : 0n;
            if (value <= 0n) continue;
            tokenMatches.push({
              contract: normalizeAddress(String(log.address ?? "")),
              value_wei: value.toString(),
              log_index: typeof log?.logIndex === "number" ? log.logIndex : null,
            });
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }

    const tokenContracts = Array.from(new Set(tokenMatches.map((m) => m.contract).filter(Boolean)));
    const tokenAssets = tokenContracts.length
      ? await retryOnceOnTransientDbError(async () => {
          return await sql<{ symbol: string; decimals: number; contract_address: string }[]>`
            SELECT symbol, decimals, contract_address
            FROM ex_asset
            WHERE chain = 'bsc'
              AND contract_address IS NOT NULL
              AND lower(contract_address) = ANY(${tokenContracts})
          `;
        })
      : ([] as Array<{ symbol: string; decimals: number; contract_address: string }>);

    const assetByContract = new Map<string, { symbol: string; decimals: number }>();
    for (const a of tokenAssets) assetByContract.set(normalizeAddress(a.contract_address), { symbol: a.symbol, decimals: a.decimals });

    const tokenTransfers = tokenMatches.map((m) => {
      const meta = assetByContract.get(m.contract);
      const decimals = meta?.decimals ?? 18;
      const amount = ethers.formatUnits(BigInt(m.value_wei), decimals);
      return {
        kind: "token" as const,
        asset_symbol: meta?.symbol ?? "UNKNOWN",
        contract: m.contract,
        amount,
        log_index: m.log_index,
      };
    });

    const nativeTransfers = nativeMatch
      ? [{
          kind: "native" as const,
          asset_symbol: "BNB",
          amount: (() => {
            try {
              const v = BigInt(String((onChain as any)?.value_wei ?? "0"));
              return ethers.formatEther(v);
            } catch {
              return "0";
            }
          })(),
          log_index: null as number | null,
        }]
      : [];

    const isOurs = Boolean(resolvedDepositAddress) && (nativeTransfers.length > 0 || tokenTransfers.length > 0 || events.length > 0);
    const verdict: "not_ours" | "pending" | "seen" | "credited" = !isOurs
      ? "not_ours"
      : credited
        ? "credited"
        : events.length > 0
          ? "seen"
          : "pending";

    const receiptStatus = typeof (onChain as any)?.status === "number" ? ((onChain as any).status as number) : null;
    const diagnostic = (() => {
      if (receiptStatus === 0) {
        return {
          kind: "reverted_tx",
          message: "This transaction reverted on-chain (status=0), so it did not complete.",
        };
      }
      if (verdict !== "not_ours") return null;

      const receipt = (onChain as any)?.receipt as any;
      if (!receipt) return null;
      if (nativeTransfers.length > 0 || tokenTransfers.length > 0 || events.length > 0) return null;

      if (!(onChain as any)?.to) {
        return {
          kind: "contract_creation_or_missing_to",
          message: "This transaction has no 'to' address (contract creation). It does not look like a direct deposit to this address.",
        };
      }

      if (txToIsContract === true) {
        return {
          kind: "contract_interaction_no_transfer_logs",
          tx_to_is_contract: true,
          message:
            "Tx interacts with a contract and has no Transfer logs to the deposit address. Internal transfers may not be detectable without trace APIs.",
        };
      }

      return {
        kind: "no_matching_transfers",
        message: "No native transfer or token Transfer logs were found to the resolved deposit address in this tx.",
      };
    })();

    const uncreditedForAddress = resolvedToAddress
      ? await retryOnceOnTransientDbError(async () => {
          const rows = await sql<{ count: number }[]>`
            SELECT count(*)::int AS count
            FROM ex_chain_deposit_event
            WHERE chain = 'bsc'
              AND lower(to_address) = ${resolvedToAddress}
              AND journal_entry_id IS NULL
          `;
          return Number(rows[0]?.count ?? 0) || 0;
        })
      : 0;

    return NextResponse.json({
      ok: true,
      chain: "bsc",
      tip,
      confirmations_required: confirmationsRequired,
      safe_tip: safeTip,
      verdict,
      cursor: {
        last_scanned_block: cursorLast,
        lag_blocks: cursorLagBlocks,
      },
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
      matches: {
        native: nativeTransfers,
        token: tokenTransfers,
      },
      events,
      credited,
      uncredited_for_address: uncreditedForAddress,
      journal_lines: journalLines,
      ...(txToIsContract != null ? { tx_to_is_contract: txToIsContract } : {}),
      ...(diagnostic ? { diagnostic } : {}),
    });
  } catch (e) {
    // Keep errors consistent with other admin APIs.
    const message = e instanceof Error ? e.message : String(e);
    return apiError("internal_error", { details: { message } });
  }
}
