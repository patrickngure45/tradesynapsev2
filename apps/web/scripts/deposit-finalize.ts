import "dotenv/config";

import { getSql } from "../src/lib/db";
import { finalizePendingBscDeposits } from "../src/lib/blockchain/depositIngest";

function envInt(name: string, fallback: number): number {
  const raw = String(process.env[name] ?? "").trim();
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

async function main() {
  const sql = getSql();
  const max = envInt("DEPOSIT_FINALIZE_MAX", 250);
  const maxMs = envInt("DEPOSIT_FINALIZE_MAX_MS", 15_000);
  const confirmations = (() => {
    const raw = String(process.env.DEPOSIT_FINALIZE_CONFIRMATIONS ?? "").trim();
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
  })();

  const result = await finalizePendingBscDeposits(sql as any, {
    max,
    maxMs,
    confirmations,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error("[deposit-finalize] failed:", e);
  process.exit(1);
});
