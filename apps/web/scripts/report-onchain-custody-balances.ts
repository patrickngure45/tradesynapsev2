import "dotenv/config";

import { ethers } from "ethers";

import { getSql } from "../src/lib/db";
import { getBscProvider, getEthProvider } from "../src/lib/blockchain/wallet";

type SupportedChain = "bsc" | "eth";

const erc20Abi = ["function balanceOf(address) view returns (uint256)"];

function chainProvider(chain: SupportedChain): ethers.JsonRpcProvider {
  return chain === "eth" ? getEthProvider() : getBscProvider();
}

async function main() {
  const sql = getSql();

  const depositAddresses = await sql<{ chain: string; address: string }[]>`
    SELECT chain, address
    FROM ex_deposit_address
    WHERE status = 'active'
      AND chain IN ('bsc','eth')
  `;

  if (depositAddresses.length === 0) {
    console.log("No active deposit addresses found for bsc/eth.");
    return;
  }

  const tokenAssets = await sql<
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

  const groupedAddresses = new Map<SupportedChain, string[]>();
  groupedAddresses.set("bsc", []);
  groupedAddresses.set("eth", []);

  for (const row of depositAddresses) {
    if (row.chain !== "bsc" && row.chain !== "eth") continue;
    groupedAddresses.get(row.chain)?.push(row.address);
  }

  const totals = new Map<string, bigint>();

  for (const chain of ["bsc", "eth"] as const) {
    const provider = chainProvider(chain);
    const addresses = groupedAddresses.get(chain) ?? [];
    if (addresses.length === 0) continue;

    let nativeTotal = 0n;
    for (const address of addresses) {
      const balance = await provider.getBalance(address);
      nativeTotal += balance;
    }

    const nativeSymbol = chain === "bsc" ? "BNB" : "ETH";
    totals.set(`${chain}:${nativeSymbol}:18`, nativeTotal);

    const assetsForChain = tokenAssets.filter((asset) => asset.chain === chain);
    for (const asset of assetsForChain) {
      const contract = new ethers.Contract(asset.contract_address, erc20Abi, provider);
      let tokenTotal = 0n;
      for (const address of addresses) {
        const value = (await contract.balanceOf(address)) as bigint;
        tokenTotal += value;
      }
      totals.set(`${chain}:${asset.symbol}:${asset.decimals}`, tokenTotal);
    }
  }

  const output = Array.from(totals.entries()).map(([key, raw]) => {
    const [chain, symbol, decimalsText] = key.split(":");
    const decimals = Number(decimalsText);
    const formatted = ethers.formatUnits(raw, Number.isFinite(decimals) ? decimals : 18);
    return { chain, symbol, tracked_onchain_balance: formatted };
  });

  console.log("=== On-chain tracked custody balances (active deposit addresses only) ===");
  console.table(output);
  console.log("Note: This excludes cold wallets / external treasury addresses not present in ex_deposit_address.");
}

main().catch((error) => {
  console.error("[report-onchain-custody-balances] failed:", error);
  process.exit(1);
});
