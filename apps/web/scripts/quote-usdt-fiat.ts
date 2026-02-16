import "dotenv/config";

import { getSql } from "../src/lib/db";
import { getOrComputeFxReferenceRate } from "../src/lib/fx/reference";

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function main() {
  const fiat = (argValue("--fiat") ?? "KES").trim().toUpperCase();
  const usd = Number(argValue("--usd") ?? "5");
  if (!Number.isFinite(usd) || usd <= 0) throw new Error("invalid --usd");

  const sql = getSql();
  try {
    const fx = await getOrComputeFxReferenceRate(sql as any, "USDT", fiat);
    if (!fx) {
      console.log(JSON.stringify({ ok: false, error: "fx_unavailable", base: "USDT", quote: fiat }, null, 2));
      process.exitCode = 1;
      return;
    }

    // Treat USDT≈USD for the base minimum.
    const fiatAmount = usd * fx.mid;

    console.log(
      JSON.stringify(
        {
          ok: true,
          base: "USDT",
          quote: fiat,
          usdt_fiat_mid: fx.mid,
          usd_amount: usd,
          fiat_amount: round2(fiatAmount),
          computed_at: fx.computedAt.toISOString(),
          valid_until: fx.validUntil.toISOString(),
          sources: fx.sources,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

main().catch((err) => {
  console.error("quote-usdt-fiat failed:", err);
  process.exit(1);
});
