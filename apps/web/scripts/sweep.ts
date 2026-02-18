import "dotenv/config";
import { ethers } from "ethers";
import { getSql } from "../src/lib/db";
import { getBscProvider, deriveWallet } from "../src/lib/blockchain/wallet";
import { getHotWalletAddress } from "../src/lib/blockchain/hotWallet";

const SYSTEM_TREASURY_USER_ID = "00000000-0000-0000-0000-000000000001";
const SYSTEM_BURN_USER_ID = "00000000-0000-0000-0000-000000000003";

const ACCOUNT_GAS_IN_LEDGER = process.env.SWEEP_ACCOUNT_GAS_LEDGER === "true";

async function ensureSystemUser(sql: ReturnType<typeof getSql>, userId: string): Promise<void> {
  await sql`
    INSERT INTO app_user (id, status, kyc_level, country)
    VALUES (${userId}::uuid, 'active', 'none', NULL)
    ON CONFLICT (id) DO NOTHING
  `;
}

async function ensureLedgerAccount(
  sql: ReturnType<typeof getSql>,
  userId: string,
  assetId: string,
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO ex_ledger_account (user_id, asset_id)
    VALUES (${userId}::uuid, ${assetId}::uuid)
    ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING id::text AS id
  `;
  return rows[0]!.id;
}

async function getBnbAssetId(sql: ReturnType<typeof getSql>): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    SELECT id::text AS id
    FROM ex_asset
    WHERE LOWER(chain) = 'bsc'
      AND symbol = 'BNB'
      AND is_enabled = true
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

async function recordGasSpend(sql: ReturnType<typeof getSql>, input: {
  txHash: string;
  gasWei: bigint;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (input.gasWei <= 0n) return;

  const bnbAssetId = await getBnbAssetId(sql);
  if (!bnbAssetId) return;

  const gasBnb = ethers.formatEther(input.gasWei);

  await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;

    await ensureSystemUser(txSql, SYSTEM_TREASURY_USER_ID);
    await ensureSystemUser(txSql, SYSTEM_BURN_USER_ID);

    const [treasuryAcct, burnAcct] = await Promise.all([
      ensureLedgerAccount(txSql, SYSTEM_TREASURY_USER_ID, bnbAssetId),
      ensureLedgerAccount(txSql, SYSTEM_BURN_USER_ID, bnbAssetId),
    ]);

    const entryRows = await txSql<{ id: string }[]>`
      INSERT INTO ex_journal_entry (type, reference, metadata_json)
      VALUES (
        'gas_spend',
        ${`onchain:bsc:${input.txHash}`},
        ${txSql.json({
          chain: "bsc",
          tx_hash: input.txHash,
          gas_wei: input.gasWei.toString(),
          gas_bnb: gasBnb,
          kind: "sweep_native",
          ...(input.metadata ?? {}),
        })}::jsonb
      )
      RETURNING id::text AS id
    `;
    const entryId = entryRows[0]!.id;

    await txSql`
      INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
      VALUES
        (${entryId}::uuid, ${treasuryAcct}::uuid, ${bnbAssetId}::uuid, ((${gasBnb}::numeric) * -1)),
        (${entryId}::uuid, ${burnAcct}::uuid, ${bnbAssetId}::uuid, (${gasBnb}::numeric))
    `;
  });
}

// Sweep any address that has more BNB than the cost of a transfer.
// No arbitrary minimum — if it's profitable to sweep (balance > gas), sweep it.

async function main() {
  const sql = getSql();
  const provider = getBscProvider();
  
  let hotWallet: string;
  try {
      hotWallet = getHotWalletAddress();
  } catch (e) {
      console.error("❌ Failed to load Hot Wallet. Check DEPLOYER_PRIVATE_KEY.");
      process.exit(1);
  }

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? ethers.parseUnits("3", "gwei");
  const gasLimit = 21000n;
  const gasCost = gasPrice * gasLimit;
  
  console.log("--- 🧹 BNB Sweeper ---");
  console.log("Hot Wallet Destination:", hotWallet);
  console.log(`Ledger gas accounting: ${ACCOUNT_GAS_IN_LEDGER ? "ON" : "OFF"}`);
  console.log(`Gas price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
  console.log(`Gas cost per sweep: ${ethers.formatEther(gasCost)} BNB`);

  const addrs = await sql<{ derivation_index: number; address: string }[]>`
    SELECT derivation_index, address FROM ex_deposit_address ORDER BY derivation_index ASC
  `;
  console.log(`Checking ${addrs.length} addresses...`);

  let sweptCount = 0;
  let totalSweptWei = 0n;

  for (const r of addrs) {
    const bal = await provider.getBalance(r.address);
    // Only sweep if balance exceeds exact gas cost (no arbitrary minimum)
    if (bal > gasCost) {
      const sendAmount = bal - gasCost;
      console.log(`\n${r.address} (idx ${r.derivation_index}): ${ethers.formatEther(bal)} BNB → sweep ${ethers.formatEther(sendAmount)}`);
      
      try {
          const { privateKey } = deriveWallet(r.derivation_index);
          const wallet = new ethers.Wallet(privateKey, provider);
          
          const tx = await wallet.sendTransaction({
            to: hotWallet,
            value: sendAmount,
            gasLimit,
            gasPrice
          });
          console.log(`   ✅ Tx: ${tx.hash}`);
          if (ACCOUNT_GAS_IN_LEDGER) {
            const receipt = await tx.wait(1).catch(() => null);
            const gasUsed = receipt ? ((receipt as any).gasUsed as bigint | undefined) : undefined;
            const gasP = receipt
              ? (((receipt as any).effectiveGasPrice ?? (receipt as any).gasPrice) as bigint | undefined)
              : undefined;
            if (typeof gasUsed === "bigint" && typeof gasP === "bigint") {
              await recordGasSpend(sql, {
                txHash: tx.hash,
                gasWei: gasUsed * gasP,
                metadata: { from: r.address },
              }).catch(() => undefined);
            }
          }
          sweptCount++;
          totalSweptWei += sendAmount;
      } catch (e: any) {
          console.error(`   ❌ Failed: ${e.message}`);
          if (e.message.includes("CITADEL_MASTER_SEED")) {
              console.error("      (Check env var CITADEL_MASTER_SEED)");
              process.exit(1);
          }
      }
    }
  }
  
  console.log(`\nDone. Swept ${sweptCount} addresses, total ${ethers.formatEther(totalSweptWei)} BNB.`);
  process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
