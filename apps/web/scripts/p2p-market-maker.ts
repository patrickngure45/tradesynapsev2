import "dotenv/config";

import { getSql } from "../src/lib/db";
import { seedP2PMarket } from "./seed-p2p-sellers";

const intervalMs = Number(process.env.P2P_MM_INTERVAL_MS ?? 45000);
const adsPerSide = Math.max(1, Number(process.env.P2P_MM_ADS_PER_SIDE ?? 2));

let stopping = false;

async function tick() {
  const sql = getSql();
  try {
    const result = await seedP2PMarket(sql, {
      closeExistingBotAds: true,
      adsPerSide,
    });
    const stamp = new Date().toISOString();
    console.log(
      `[${stamp}] refreshed bot ads: total=${result.totalAds}, sellers=${result.totalSellers}, byFiat=${result.byFiat
        .map((x) => `${x.fiat_currency}:${x.ads}`)
        .join(",")}`,
    );
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

async function run() {
  console.log(`Starting P2P market maker loop (interval=${intervalMs}ms, adsPerSide=${adsPerSide})`);
  while (!stopping) {
    try {
      await tick();
    } catch (error) {
      const stamp = new Date().toISOString();
      console.error(`[${stamp}] market maker tick failed:`, error);
    }
    if (stopping) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  console.log("P2P market maker stopped.");
}

process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

run().catch((error) => {
  console.error("P2P market maker failed:", error);
  process.exitCode = 1;
});
