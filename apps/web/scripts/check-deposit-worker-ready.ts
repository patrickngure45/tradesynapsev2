import postgres from "postgres";
import "dotenv/config";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");

  const sslRequired = /\brlwy\.net\b/i.test(dbUrl);
  const sql = postgres(dbUrl, {
    max: 1,
    connect_timeout: Number(process.env.DB_CONNECT_TIMEOUT_SEC ?? 60) || 60,
    idle_timeout: 20,
    ...(sslRequired ? { ssl: "require" as const } : {}),
  });

  try {
    await sql`SELECT 1`;

    const cols = await sql<
      {
        name: string;
        ok: boolean;
      }[]
    >`
      SELECT
        c.column_name AS name,
        true AS ok
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'ex_chain_deposit_event'
        AND c.column_name IN ('status','credited_at','confirmed_at','hold_id')
      ORDER BY c.column_name
    `;

    const have = new Set(cols.map((c) => c.name));
    const missing = ["status", "credited_at", "confirmed_at", "hold_id"].filter((x) => !have.has(x));

    const holdCols = await sql<{ name: string }[]>`
      SELECT c.column_name AS name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'ex_hold'
        AND c.column_name IN ('remaining_amount','released_at','status')
      ORDER BY c.column_name
    `;

    const haveHold = new Set(holdCols.map((c) => c.name));
    const missingHold = ["remaining_amount", "released_at", "status"].filter((x) => !haveHold.has(x));

    const trig = await sql<{ exists: boolean }[]>`
      SELECT EXISTS(
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'ex_hold_set_remaining_amount_trg'
      ) AS exists
    `;

    const ok = missing.length === 0 && missingHold.length === 0 && Boolean(trig[0]?.exists);

    if (!ok) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            missing_deposit_event_columns: missing,
            missing_hold_columns: missingHold,
            has_hold_remaining_trigger: Boolean(trig[0]?.exists),
          },
          null,
          2,
        ),
      );
      process.exit(2);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          deposit_event_columns: Array.from(have).sort(),
          hold_columns: Array.from(haveHold).sort(),
          has_hold_remaining_trigger: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

main().catch((e) => {
  console.error("[check-deposit-worker-ready] error:", e);
  process.exit(1);
});
