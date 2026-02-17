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

    // Fallback: if live FX compute is unavailable in this environment, use the most recent cached rate.
    const cachedRows =
      fx
        ? []
        : await sql<
            {
              mid: string;
              computed_at: Date;
              valid_until: Date;
              sources: any;
            }[]
          >`
            SELECT
              mid::text AS mid,
              computed_at,
              valid_until,
              sources
            FROM fx_reference_rate
            WHERE base_symbol = 'USDT'
              AND quote_symbol = ${fiat}
            ORDER BY computed_at DESC
            LIMIT 1
          `;

    const fxMid = fx?.mid ?? (cachedRows[0] ? Number(cachedRows[0].mid) : null);
    const computedAt = fx?.computedAt ?? cachedRows[0]?.computed_at ?? null;
    const validUntil = fx?.validUntil ?? cachedRows[0]?.valid_until ?? null;
    const sources = fx?.sources ?? cachedRows[0]?.sources ?? null;

    if (!(typeof fxMid === "number" && Number.isFinite(fxMid) && fxMid > 0)) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            error: "fx_unavailable",
            base: "USDT",
            quote: fiat,
            hint: "Set FX_USD_FIAT_OVERRIDE_<FIAT> (e.g. FX_USD_FIAT_OVERRIDE_KES=160) or provide --usd-fiat-mid when seeding ads.",
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
      return;
    }

    // Treat USDT≈USD for the base minimum.
    const fiatAmount = usd * fxMid;

    console.log(
      JSON.stringify(
        {
          ok: true,
          base: "USDT",
          quote: fiat,
          usdt_fiat_mid: fxMid,
          usd_amount: usd,
          fiat_amount: round2(fiatAmount),
          computed_at: computedAt ? new Date(computedAt).toISOString() : null,
          valid_until: validUntil ? new Date(validUntil).toISOString() : null,
          sources,
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
