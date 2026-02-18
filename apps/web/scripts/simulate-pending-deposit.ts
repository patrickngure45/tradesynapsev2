import postgres from "postgres";
import "dotenv/config";
import { ethers } from "ethers";

function envBool(name: string, fallback = false): boolean {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

function randomHex(bytes: number): string {
  return ethers.hexlify(ethers.randomBytes(bytes));
}

async function getBscBlockNumber(): Promise<number> {
  const rpcUrl = process.env.BSC_RPC_URL || "https://bsc-rpc.publicnode.com";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return provider.getBlockNumber();
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

  const chain = "bsc";
  const confirmations = Number.parseInt(process.env.DEPOSIT_CONFIRMATIONS ?? "3", 10) || 3;

  const userId = (process.env.SIM_USER_ID ?? "").trim() || crypto.randomUUID();
  const symbol = (process.env.SIM_ASSET_SYMBOL ?? "USDT").trim().toUpperCase();
  const amount = (process.env.SIM_AMOUNT ?? "25").trim();

  const verbose = envBool("SIM_VERBOSE");

  try {
    await sql`SELECT 1`;

    // Ensure user exists (minimal columns; relies on defaults for others).
    await sql`
      INSERT INTO app_user (id, status, kyc_level, country)
      VALUES (${userId}::uuid, 'active', 'full', 'ZZ')
      ON CONFLICT (id) DO NOTHING
    `;

    const assetRows = await sql<{ id: string; decimals: number }[]>`
      SELECT id, decimals
      FROM ex_asset
      WHERE chain = ${chain}
        AND symbol = ${symbol}
        AND is_enabled = true
      LIMIT 1
    `;
    if (assetRows.length === 0) {
      throw new Error(`asset_not_found:${chain}:${symbol}`);
    }
    const assetId = assetRows[0]!.id;

    const acctRows = await sql<{ id: string }[]>`
      INSERT INTO ex_ledger_account (user_id, asset_id)
      VALUES (${userId}::uuid, ${assetId}::uuid)
      ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id
    `;
    const accountId = acctRows[0]!.id;

    const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";
    await sql`
      INSERT INTO app_user (id, status, kyc_level, country)
      VALUES (${SYSTEM_USER_ID}::uuid, 'active', 'full', 'ZZ')
      ON CONFLICT (id) DO NOTHING
    `;

    const sysAcctRows = await sql<{ id: string }[]>`
      INSERT INTO ex_ledger_account (user_id, asset_id)
      VALUES (${SYSTEM_USER_ID}::uuid, ${assetId}::uuid)
      ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id
    `;

    const sysAccountId = sysAcctRows[0]!.id;

    // Resolve current block (best-effort).
    const currentBlock = await getBscBlockNumber().catch(() => 0);

    const txHash = process.env.SIM_TX_HASH?.trim() || randomHex(32);
    const logIndex = Number.parseInt(process.env.SIM_LOG_INDEX ?? "0", 10) || 0;

    // Create ledger credit first.
    // IMPORTANT: metadata_json must be a JSON object (not a JSONB string).
    const entryMetadata = { sim: true, chain, tx_hash: txHash, log_index: logIndex, asset: symbol, amount };
    const entryRows = await (sql as any)<{ id: string }[]>`
      INSERT INTO ex_journal_entry (type, reference, metadata_json)
      VALUES (
        'deposit',
        ${`sim:${chain}:${txHash}:${logIndex}`},
        ${entryMetadata}::jsonb
      )
      RETURNING id
    `;

    const entryId = entryRows[0]!.id;

    await sql`
      INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
      VALUES
        (${entryId}::uuid, ${accountId}::uuid, ${assetId}::uuid, (${amount}::numeric)),
        (${entryId}::uuid, ${sysAccountId}::uuid, ${assetId}::uuid, ((${amount}::numeric) * -1))
    `;

    // Create hold (locked until confirmations).
    const holdRows = await sql<{ id: string }[]>`
      INSERT INTO ex_hold (account_id, asset_id, amount, reason)
      VALUES (${accountId}::uuid, ${assetId}::uuid, (${amount}::numeric), ${`deposit_pending:${chain}:${txHash}:${logIndex}`})
      RETURNING id
    `;
    const holdId = holdRows[0]!.id;

    // Create deposit event row (pending)
    const eventRows = await sql<{ id: number }[]>`
      INSERT INTO ex_chain_deposit_event (
        chain, tx_hash, log_index, block_number,
        from_address, to_address,
        user_id, asset_id, amount,
        journal_entry_id,
        status, credited_at, confirmed_at, hold_id
      )
      VALUES (
        ${chain},
        ${txHash},
        ${logIndex},
        ${currentBlock},
        ${"0x0000000000000000000000000000000000000000"},
        ${"0x0000000000000000000000000000000000000000"},
        ${userId}::uuid,
        ${assetId}::uuid,
        (${amount}::numeric),
        ${entryId}::uuid,
        'pending',
        now(),
        NULL,
        ${holdId}::uuid
      )
      RETURNING id
    `;

    const eventId = eventRows[0]!.id;

    console.log(
      JSON.stringify(
        {
          ok: true,
          user_id: userId,
          asset_symbol: symbol,
          amount,
          confirmations,
          current_block: currentBlock,
          event_id: eventId,
          hold_id: holdId,
          note: "Pending deposit inserted; watcher should finalize once block_number is safe.",
        },
        null,
        2,
      ),
    );

    const startedAt = Date.now();
    const timeoutMs = Number.parseInt(process.env.SIM_TIMEOUT_MS ?? "90000", 10) || 90_000;
    const pollMs = Number.parseInt(process.env.SIM_POLL_MS ?? "5000", 10) || 5000;

    while (Date.now() - startedAt < timeoutMs) {
      const [evt] = await sql<
        {
          status: string;
          block_number: number;
          confirmed_at: string | null;
          hold_status: string | null;
          hold_remaining: string | null;
        }[]
      >`
        SELECT
          e.status,
          e.block_number,
          e.confirmed_at::text AS confirmed_at,
          h.status::text AS hold_status,
          h.remaining_amount::text AS hold_remaining
        FROM ex_chain_deposit_event e
        LEFT JOIN ex_hold h ON h.id = e.hold_id
        WHERE e.id = ${eventId}
        LIMIT 1
      `;

      if (!evt) throw new Error("missing_event_row");

      if (verbose) {
        console.log(
          JSON.stringify(
            {
              t: new Date().toISOString(),
              event_status: evt.status,
              hold_status: evt.hold_status,
              hold_remaining: evt.hold_remaining,
              confirmed_at: evt.confirmed_at,
            },
            null,
            2,
          ),
        );
      }

      if (evt.status === "confirmed" && evt.hold_status === "released") {
        console.log(
          JSON.stringify(
            {
              ok: true,
              finalized: true,
              event_status: evt.status,
              hold_status: evt.hold_status,
              confirmed_at: evt.confirmed_at,
            },
            null,
            2,
          ),
        );
        break;
      }

      await new Promise((r) => setTimeout(r, pollMs));
    }
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

main().catch((e) => {
  console.error("[simulate-pending-deposit] error:", e);
  process.exit(1);
});
