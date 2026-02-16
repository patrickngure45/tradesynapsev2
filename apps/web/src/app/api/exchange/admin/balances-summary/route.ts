import { ethers } from "ethers";

import { apiError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { getBscProvider, getEthProvider } from "@/lib/blockchain/wallet";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";
const CAP_USER_ID = "00000000-0000-0000-0000-000000000002";
const BURN_USER_ID = "00000000-0000-0000-0000-000000000003";

type SupportedChain = "bsc" | "eth";

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

function providerForChain(chain: SupportedChain): ethers.JsonRpcProvider {
  return chain === "eth" ? getEthProvider() : getBscProvider();
}

export async function GET(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  try {
    const offchain = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          bucket: string;
          chain: string;
          symbol: string;
          posted: string;
          held: string;
          available: string;
        }[]
      >`
        WITH accounts AS (
          SELECT
            la.id AS account_id,
            la.user_id,
            asset.chain,
            asset.symbol
          FROM ex_ledger_account la
          JOIN ex_asset asset ON asset.id = la.asset_id
          WHERE asset.is_enabled = true
        ),
        posted AS (
          SELECT account_id, coalesce(sum(amount), 0)::numeric AS posted
          FROM ex_journal_line
          GROUP BY account_id
        ),
        held AS (
          SELECT account_id, coalesce(sum(remaining_amount), 0)::numeric AS held
          FROM ex_hold
          WHERE status = 'active'
          GROUP BY account_id
        ),
        account_bal AS (
          SELECT
            a.user_id,
            a.chain,
            a.symbol,
            coalesce(p.posted, 0)::numeric AS posted,
            coalesce(h.held, 0)::numeric AS held,
            (coalesce(p.posted, 0)::numeric - coalesce(h.held, 0)::numeric) AS available
          FROM accounts a
          LEFT JOIN posted p ON p.account_id = a.account_id
          LEFT JOIN held h ON h.account_id = a.account_id
        )
        SELECT
          CASE
            WHEN user_id = ${SYSTEM_USER_ID}::uuid THEN 'system'
            WHEN user_id = ${CAP_USER_ID}::uuid THEN 'cap'
            WHEN user_id = ${BURN_USER_ID}::uuid THEN 'burn'
            ELSE 'users'
          END AS bucket,
          chain,
          symbol,
          sum(posted)::text AS posted,
          sum(held)::text AS held,
          sum(available)::text AS available
        FROM account_bal
        GROUP BY 1,2,3
        ORDER BY chain ASC, symbol ASC, bucket ASC
      `;
    });

    const depositAddresses = await retryOnceOnTransientDbError(async () => {
      return await sql<{ chain: string; address: string }[]>`
        SELECT chain, address
        FROM ex_deposit_address
        WHERE status = 'active'
          AND chain IN ('bsc','eth')
      `;
    });

    const tokenAssets = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          chain: string;
          symbol: string;
          contract_address: string;
          decimals: number;
        }[]
      >`
        SELECT chain, symbol, contract_address, decimals
        FROM ex_asset
        WHERE is_enabled = true
          AND contract_address IS NOT NULL
          AND chain IN ('bsc','eth')
      `;
    });

    const groupedAddresses = new Map<SupportedChain, string[]>();
    groupedAddresses.set("bsc", []);
    groupedAddresses.set("eth", []);

    for (const row of depositAddresses) {
      if (row.chain !== "bsc" && row.chain !== "eth") continue;
      groupedAddresses.get(row.chain)?.push(row.address);
    }

    const onchainRows: Array<{ chain: string; symbol: string; trackedOnchainBalance: string }> = [];

    for (const chain of ["bsc", "eth"] as const) {
      const provider = providerForChain(chain);
      const addresses = groupedAddresses.get(chain) ?? [];
      if (addresses.length === 0) continue;

      let nativeTotal = 0n;
      for (const address of addresses) {
        nativeTotal += await provider.getBalance(address);
      }
      onchainRows.push({
        chain,
        symbol: chain === "bsc" ? "BNB" : "ETH",
        trackedOnchainBalance: ethers.formatUnits(nativeTotal, 18),
      });

      const assetsForChain = tokenAssets.filter((asset) => asset.chain === chain);
      for (const asset of assetsForChain) {
        const contract = new ethers.Contract(asset.contract_address, ERC20_ABI, provider);
        let tokenTotal = 0n;
        for (const address of addresses) {
          tokenTotal += (await contract.balanceOf(address)) as bigint;
        }
        onchainRows.push({
          chain,
          symbol: asset.symbol,
          trackedOnchainBalance: ethers.formatUnits(tokenTotal, asset.decimals),
        });
      }
    }

    return Response.json({
      offchain,
      onchainTrackedCustody: onchainRows,
      metadata: {
        includesOnlyTrackedDepositAddresses: true,
        excludesExternalColdWallets: true,
        systemUserId: SYSTEM_USER_ID,
        capUserId: CAP_USER_ID,
        burnUserId: BURN_USER_ID,
        computedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const resp = responseForDbError("exchange.admin.balances_summary", error);
    if (resp) return resp;
    throw error;
  }
}
