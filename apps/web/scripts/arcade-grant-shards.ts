import "dotenv/config";

import { getSql } from "../src/lib/db";
import { SHARD_ITEM } from "../src/lib/arcade/crafting";

function requiredEnv(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function intEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid env var ${name}: must be a number`);
  return Math.trunc(n);
}

async function main() {
  const userId = requiredEnv("USER_ID");
  const amount = intEnv("SHARDS", 200);
  const apply = process.argv.includes("--apply");

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error("USER_ID must be a UUID");
  }
  if (amount <= 0 || amount > 1_000_000) {
    throw new Error("SHARDS must be between 1 and 1000000");
  }

  const sql = getSql();

  const [before] = await sql<{ quantity: number }[]>`
    SELECT quantity
    FROM arcade_inventory
    WHERE user_id = ${userId}::uuid
      AND kind = ${SHARD_ITEM.kind}
      AND code = ${SHARD_ITEM.code}
      AND rarity = ${SHARD_ITEM.rarity}
    LIMIT 1
  `;

  const beforeQty = Number(before?.quantity ?? 0);
  const afterQty = beforeQty + amount;

  console.log(
    `[arcade-grant-shards] user=${userId} before=${beforeQty} grant=${amount} after=${afterQty} apply=${apply}`,
  );

  if (!apply) {
    console.log("[arcade-grant-shards] dry-run. Re-run with --apply to write.");
    return;
  }

  await sql`
    INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
    VALUES (
      ${userId}::uuid,
      ${SHARD_ITEM.kind},
      ${SHARD_ITEM.code},
      ${SHARD_ITEM.rarity},
      ${amount},
      ${sql.json({ label: "Arcade Shards", source: "admin_grant" })},
      now(),
      now()
    )
    ON CONFLICT (user_id, kind, code, rarity)
    DO UPDATE SET quantity = arcade_inventory.quantity + EXCLUDED.quantity, updated_at = now()
  `;

  const [after] = await sql<{ quantity: number }[]>`
    SELECT quantity
    FROM arcade_inventory
    WHERE user_id = ${userId}::uuid
      AND kind = ${SHARD_ITEM.kind}
      AND code = ${SHARD_ITEM.code}
      AND rarity = ${SHARD_ITEM.rarity}
    LIMIT 1
  `;

  console.log(`[arcade-grant-shards] ✅ new_quantity=${Number(after?.quantity ?? 0)}`);
}

main().catch((e) => {
  console.error("[arcade-grant-shards] FAILED", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
