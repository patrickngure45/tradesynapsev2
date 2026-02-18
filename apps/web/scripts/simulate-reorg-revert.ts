import postgres from "postgres";
import "dotenv/config";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

  const chain = (process.env.SIM_CHAIN ?? "bsc").trim().toLowerCase();
  if (chain !== "bsc" && chain !== "eth") throw new Error("SIM_CHAIN must be bsc|eth");

  const idsRaw = (process.env.SIM_EVENT_IDS ?? "").trim();
  const ids = idsRaw
    ? idsRaw
        .split(",")
        .map((x) => Number.parseInt(x.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    : [2];

  try {
    const before = await sql.unsafe(
      `select id,status,tx_hash,log_index,hold_id::text as hold_id,journal_entry_id::text as journal_entry_id from ex_chain_deposit_event where chain='${chain}' and id = any($1::bigint[]) order by id`,
      [ids],
    );
    console.log(JSON.stringify({ before }, null, 2));

    // Force events to look like they are in a reorg-able recent range.
    // Then make them definitely NOT exist on-chain by setting a garbage tx_hash.
    await sql.unsafe(
      `update ex_chain_deposit_event set tx_hash = '0xdeadbeef', block_number = greatest(0, (select max(last_scanned_block) from ex_chain_deposit_cursor where chain='${chain}') - 2), status='confirmed' where chain='${chain}' and id = any($1::bigint[])`,
      [ids],
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          note: "Events mutated to be missing on-chain. Wait for deposit watcher (DEPOSIT_PENDING_CREDIT=1) to revert them.",
          ids,
        },
        null,
        2,
      ),
    );

    const timeoutMs = Number.parseInt(process.env.SIM_TIMEOUT_MS ?? "120000", 10) || 120_000;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const rows = await sql.unsafe(
        `select e.id,e.status,e.confirmed_at::text as confirmed_at,h.status::text as hold_status,h.released_at::text as released_at from ex_chain_deposit_event e left join ex_hold h on h.id=e.hold_id where e.chain='${chain}' and e.id = any($1::bigint[]) order by e.id`,
        [ids],
      );

      console.log(JSON.stringify({ t: new Date().toISOString(), rows }, null, 2));

      const done = (rows as any[]).every((r) => String(r.status) === "reverted");
      if (done) {
        console.log(JSON.stringify({ ok: true, reverted: true, ids }, null, 2));
        break;
      }

      await sleep(10_000);
    }
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

main().catch((e) => {
  console.error("[simulate-reorg-revert] error:", e);
  process.exit(1);
});
