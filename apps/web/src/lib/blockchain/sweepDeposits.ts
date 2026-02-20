import { ethers } from "ethers";
import type { Sql } from "postgres";

import { getBscProvider, getDepositAddressKey } from "@/lib/blockchain/wallet";
import { getHotWalletAddress, getHotWalletKey } from "@/lib/blockchain/hotWallet";
import { getTokenBalance, sendBnb, sendToken } from "@/lib/blockchain/tokens";
import { upsertServiceHeartbeat } from "@/lib/system/heartbeat";

const SYSTEM_TREASURY_USER_ID = "00000000-0000-0000-0000-000000000001";
const SYSTEM_BURN_USER_ID = "00000000-0000-0000-0000-000000000003";

// Well-known BEP-20 contracts to sweep (beyond what's in ex_asset)
const EXTRA_TOKENS: Record<string, string> = {
  WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  BUSD: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
  DAI: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3",
  ETH: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
  BTCB: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
};

type DepositRow = {
  address: string;
  derivation_index: number;
};

type SweepToken = {
  symbol: string;
  contract: string;
  decimals: number | null;
  minSweep: number;
};

export type SweepDepositsResult = {
  ok: true;
  chain: "bsc";
  execute: boolean;
  requestedExecute?: boolean;
  requestedGasTopups?: boolean;
  tokenSymbols?: string[] | null;
  deposits: number;
  sweptTransfers: number;
  gasTopups: number;
  tokenContracts: number;
  startedAt: string;
  finishedAt: string;
};

const TOKEN_TRANSFER_GAS = 65000n;
const NATIVE_TRANSFER_GAS = 21000n;
const GAS_MARGIN = 1.15;

function envBool(name: string): boolean {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function envNum(name: string, fallback: number): number {
  const raw = String(process.env[name] ?? "").trim();
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

async function ensureSystemUser(sql: Sql, userId: string): Promise<void> {
  await sql`
    INSERT INTO app_user (id, status, kyc_level, country)
    VALUES (${userId}::uuid, 'active', 'none', NULL)
    ON CONFLICT (id) DO NOTHING
  `;
}

async function ensureLedgerAccount(sql: Sql, userId: string, assetId: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO ex_ledger_account (user_id, asset_id)
    VALUES (${userId}::uuid, ${assetId}::uuid)
    ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING id::text AS id
  `;
  return rows[0]!.id;
}

async function getBnbAssetId(sql: Sql): Promise<string | null> {
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

async function gasCostWeiFromReceipt(provider: ethers.JsonRpcProvider, txHash: string): Promise<bigint | null> {
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) return null;
  const gasUsed = (receipt as any).gasUsed as bigint | undefined;
  const gasPrice = ((receipt as any).effectiveGasPrice ?? (receipt as any).gasPrice) as bigint | undefined;
  if (typeof gasUsed !== "bigint" || typeof gasPrice !== "bigint") return null;
  return gasUsed * gasPrice;
}

async function recordGasSpend(
  sql: Sql,
  input: {
    txHash: string;
    gasWei: bigint;
    kind: "sweep_gas_topup" | "sweep_token" | "sweep_native";
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  if (input.gasWei <= 0n) return;

  const bnbAssetId = await getBnbAssetId(sql);
  if (!bnbAssetId) return;

  const gasBnb = ethers.formatEther(input.gasWei);

  await sql.begin(async (tx) => {
    const txSql = tx as unknown as Sql;

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
        ${
          (txSql as any).json({
            chain: "bsc",
            tx_hash: input.txHash,
            gas_wei: input.gasWei.toString(),
            gas_bnb: gasBnb,
            kind: input.kind,
            ...(input.metadata ?? {}),
          })
        }::jsonb
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

async function buildTokenList(
  sql: Sql,
  defaultMinSweep: number,
  opts?: { tokenSymbols?: string[] },
): Promise<SweepToken[]> {
  const tokenSymbols = (opts?.tokenSymbols ?? []).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean);
  const dbAssets = await sql<
    {
      symbol: string;
      contract_address: string;
      decimals: number;
    }[]
  >`
    SELECT symbol, contract_address, decimals
    FROM ex_asset
    WHERE chain = 'bsc'
      AND is_enabled = true
      AND contract_address IS NOT NULL
      AND (${tokenSymbols.length === 0}::boolean OR upper(symbol) = ANY(${tokenSymbols}))
  `;

  const seen = new Set<string>();
  const tokens: SweepToken[] = [];

  for (const a of dbAssets) {
    const key = a.contract_address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const envMin = process.env[`SWEEP_MIN_${a.symbol.toUpperCase()}`];
    tokens.push({
      symbol: a.symbol,
      contract: a.contract_address,
      decimals: a.decimals,
      minSweep: envMin ? Number(envMin) : defaultMinSweep,
    });
  }

  const includeExtra = envBool("SWEEP_INCLUDE_EXTRA_TOKENS");
  if (!includeExtra) return tokens;

  for (const [symbol, contract] of Object.entries(EXTRA_TOKENS)) {
    const key = contract.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const envMin = process.env[`SWEEP_MIN_${symbol.toUpperCase()}`];
    tokens.push({
      symbol,
      contract,
      decimals: null,
      minSweep: envMin ? Number(envMin) : defaultMinSweep,
    });
  }

  return tokens;
}

export async function sweepBscDeposits(
  sql: Sql,
  opts?: {
    execute?: boolean;
    allowGasTopups?: boolean;
    tokenSymbols?: string[];
  },
): Promise<SweepDepositsResult> {
  const startedAt = new Date().toISOString();

  // Safety: SWEEP_EXECUTE enables execution, but callers must also explicitly
  // request it (e.g. cron URL `.../sweep-deposits?execute=1`) to prevent
  // accidental fund movement from misconfigured schedulers.
  const requestedExecute = Boolean(opts?.execute);
  const EXECUTE = envBool("SWEEP_EXECUTE") && requestedExecute;

  // Gas top-ups are extra-risky; require explicit opt-in.
  const requestedGasTopups = Boolean(opts?.allowGasTopups);
  const ALLOW_GAS_TOPUPS = envBool("SWEEP_ALLOW_GAS_TOPUPS") && requestedGasTopups;
  const ACCOUNT_GAS_IN_LEDGER = envBool("SWEEP_ACCOUNT_GAS_LEDGER");
  const MIN_BNB = (process.env.SWEEP_MIN_BNB || "0.0001").trim();
  const DEFAULT_MIN_SWEEP = envNum("SWEEP_MIN_TOKEN", 0.001);

  const provider = getBscProvider();
  const hotWallet = getHotWalletAddress();
  if (!ethers.isAddress(hotWallet)) {
    throw new Error("invalid_hot_wallet_address");
  }

  const beat = async (details?: Record<string, unknown>) => {
    try {
      await upsertServiceHeartbeat(sql as any, {
        service: "sweep-deposits:bsc",
        status: "ok",
        details: {
          execute: EXECUTE,
          min_bnb: MIN_BNB,
          min_token_default: DEFAULT_MIN_SWEEP,
          ...(details ?? {}),
        },
      });
    } catch {
      // ignore
    }
  };

  await beat({ event: "start" });

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? ethers.parseUnits("3", "gwei");
  const tokenGasCost = gasPrice * TOKEN_TRANSFER_GAS;
  const nativeGasCost = gasPrice * NATIVE_TRANSFER_GAS;
  const minBnbWei = ethers.parseEther(MIN_BNB);

  const tokenSymbols = (opts?.tokenSymbols ?? []).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean);
  const tokens = await buildTokenList(sql, DEFAULT_MIN_SWEEP, { tokenSymbols });

  console.log("--- DEPOSIT SWEEPER ---");
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "PLAN ONLY"}`);
  console.log(`Hot wallet: ${hotWallet}`);
  if (EXECUTE) {
    console.log(`Ledger gas accounting: ${ACCOUNT_GAS_IN_LEDGER ? "ON" : "OFF"}`);
    console.log(`Gas top-ups: ${ALLOW_GAS_TOPUPS ? "ENABLED" : "DISABLED"}`);
  }
  console.log(`Gas price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
  console.log(`Token gas cost: ${ethers.formatEther(tokenGasCost)} BNB per token transfer`);
  console.log(`Native gas cost: ${ethers.formatEther(nativeGasCost)} BNB`);
  console.log(`Tokens tracked: ${tokens.map((t) => t.symbol).join(", ")} (${tokens.length} total)`);

  const deposits = await sql<DepositRow[]>`
    SELECT address, derivation_index
    FROM ex_deposit_address
    WHERE chain = 'bsc' OR chain = 'BSC'
    ORDER BY derivation_index ASC
  `;

  if (deposits.length === 0) {
    await beat({ event: "noop", deposits: 0 });
    const finishedAt = new Date().toISOString();
    return {
      ok: true,
      chain: "bsc",
      execute: EXECUTE,
      deposits: 0,
      sweptTransfers: 0,
      gasTopups: 0,
      tokenContracts: tokens.length,
      startedAt,
      finishedAt,
    };
  }

  let sweptTransfers = 0;
  let gasTopups = 0;

  for (const dep of deposits) {
    const address = dep.address.toLowerCase();
    if (address === hotWallet.toLowerCase()) continue;

    let bnbBal = await provider.getBalance(address);

    let hasAnyToken = false;
    const tokenResults: Array<{
      token: SweepToken;
      balance: string;
      decimals: number;
      balNum: number;
    }> = [];

    const tokenChecks = await Promise.allSettled(
      tokens.map(async (t) => {
        const { balance, decimals } = await getTokenBalance(t.contract, address);
        return { token: t, balance, decimals, balNum: Number(balance) };
      }),
    );

    for (const result of tokenChecks) {
      if (result.status === "fulfilled") {
        if (result.value.balNum > 0) hasAnyToken = true;
        tokenResults.push(result.value);
      }
    }

    if (bnbBal === 0n && !hasAnyToken) continue;
    if (bnbBal < minBnbWei && !hasAnyToken) continue;

    console.log(`\nAddress ${address} (idx ${dep.derivation_index})`);
    console.log(`  BNB: ${ethers.formatEther(bnbBal)}`);

    const privKey = await getDepositAddressKey(sql, address);
    if (!privKey) {
      console.log("  Skipping (no private key available)");
      continue;
    }

    const sweepableTokens = tokenResults.filter((r) => !Number.isNaN(r.balNum) && r.balNum >= r.token.minSweep);
    for (const { token: t, balance, balNum } of tokenResults) {
      if (balNum > 0) console.log(`  ${t.symbol}: ${balance}`);
    }

    // Top up exact gas if there are token sweeps and gas is insufficient
    if (sweepableTokens.length > 0) {
      const totalTokenGasNeeded = tokenGasCost * BigInt(sweepableTokens.length);
      const gasNeededWithMargin = (totalTokenGasNeeded * BigInt(Math.round(GAS_MARGIN * 100))) / 100n;
      if (bnbBal < gasNeededWithMargin) {
        const deficit = gasNeededWithMargin - bnbBal;
        const topupAmount = ethers.formatEther(deficit);
        console.log(`  PLAN: top-up ${topupAmount} BNB for gas (${sweepableTokens.length} token transfers)`);
        if (EXECUTE && ALLOW_GAS_TOPUPS) {
          try {
            const hotKey = getHotWalletKey();
            const tx = await sendBnb(hotKey, address, topupAmount);
            console.log(`  ✅ Gas top-up sent: ${tx.txHash}`);
            if (ACCOUNT_GAS_IN_LEDGER) {
              const gasWei = await gasCostWeiFromReceipt(provider, tx.txHash).catch(() => null);
              if (gasWei) {
                await recordGasSpend(sql, {
                  txHash: tx.txHash,
                  gasWei,
                  kind: "sweep_gas_topup",
                  metadata: { to: address, amount_bnb: topupAmount },
                }).catch(() => undefined);
              }
            }
            gasTopups += 1;
            await new Promise((r) => setTimeout(r, 3000));
            bnbBal = await provider.getBalance(address);
          } catch (e: any) {
            console.log(`  ❌ Gas top-up failed: ${e?.message ?? String(e)}`);
          }
        } else if (EXECUTE && !ALLOW_GAS_TOPUPS) {
          console.log("  NOTE: gas top-ups disabled; token sweeps may be skipped for insufficient gas.");
        }
      }
    }

    // Sweep tokens first
    for (const { token: t, balance, decimals } of sweepableTokens) {
      if (bnbBal < tokenGasCost) {
        console.log(`  Skipping ${t.symbol} (insufficient gas: ${ethers.formatEther(bnbBal)} BNB)`);
        continue;
      }

      console.log(`  PLAN: sweep ${balance} ${t.symbol} -> ${hotWallet}`);
      if (EXECUTE) {
        try {
          const tx = await sendToken(t.contract, privKey, hotWallet, balance, decimals);
          console.log(`  ✅ ${t.symbol} swept: ${tx.txHash}`);
          if (ACCOUNT_GAS_IN_LEDGER) {
            const gasWei = await gasCostWeiFromReceipt(provider, tx.txHash).catch(() => null);
            if (gasWei) {
              await recordGasSpend(sql, {
                txHash: tx.txHash,
                gasWei,
                kind: "sweep_token",
                metadata: { from: address, token: t.symbol, contract: t.contract },
              }).catch(() => undefined);
            }
          }
          sweptTransfers += 1;
          bnbBal = await provider.getBalance(address);
        } catch (e: any) {
          console.log(`  ❌ ${t.symbol} sweep failed: ${e?.message ?? String(e)}`);
        }
      }
    }

    // Sweep native BNB last
    const remainingBnb = await provider.getBalance(address);
    if (remainingBnb > nativeGasCost) {
      const sweepable = remainingBnb - nativeGasCost;
      console.log(`  PLAN: sweep ${ethers.formatEther(sweepable)} BNB -> ${hotWallet}`);
      if (EXECUTE) {
        try {
          const wallet = new ethers.Wallet(privKey, provider);
          const tx = await wallet.sendTransaction({
            to: hotWallet,
            value: sweepable,
            gasLimit: NATIVE_TRANSFER_GAS,
            gasPrice,
          });
          console.log(`  ✅ BNB swept: ${tx.hash}`);
          if (ACCOUNT_GAS_IN_LEDGER) {
            const gasWei = await gasCostWeiFromReceipt(provider, tx.hash).catch(() => null);
            if (gasWei) {
              await recordGasSpend(sql, {
                txHash: tx.hash,
                gasWei,
                kind: "sweep_native",
                metadata: { from: address },
              }).catch(() => undefined);
            }
          }
          sweptTransfers += 1;
        } catch (e: any) {
          console.log(`  ❌ BNB sweep failed: ${e?.message ?? String(e)}`);
        }
      }
    } else if (remainingBnb > 0n) {
      console.log(`  Dust: ${ethers.formatEther(remainingBnb)} BNB (< gas cost, leaving)`);
    }

    await beat({ event: "progress", sweptTransfers, gasTopups, deposits: deposits.length });
  }

  await beat({ event: "done", sweptTransfers, gasTopups, deposits: deposits.length });

  const finishedAt = new Date().toISOString();
  return {
    ok: true,
    chain: "bsc",
    execute: EXECUTE,
    requestedExecute,
    requestedGasTopups,
    tokenSymbols: tokenSymbols.length ? tokenSymbols : null,
    deposits: deposits.length,
    sweptTransfers,
    gasTopups,
    tokenContracts: tokens.length,
    startedAt,
    finishedAt,
  };
}
