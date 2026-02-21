import "dotenv/config";

import { getSql } from "../src/lib/db";

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

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function main() {
  const userId = requiredEnv("USER_ID");
  const kind = requiredEnv("KIND");
  const code = requiredEnv("CODE");
  const rarity = requiredEnv("RARITY");
  const quantity = intEnv("QTY", 1);
  const apply = process.argv.includes("--apply");

  if (!isUuid(userId)) throw new Error("USER_ID must be a UUID");
  if (quantity <= 0 || quantity > 100_000) throw new Error("QTY must be between 1 and 100000");

  const sql = getSql();

  const [before] = await sql<{ quantity: number }[]>`
    SELECT quantity
    FROM arcade_inventory
    WHERE user_id = ${userId}::uuid
      AND kind = ${kind}
      AND code = ${code}
      AND rarity = ${rarity}
    LIMIT 1
  `;

  const beforeQty = Number(before?.quantity ?? 0);
  const afterQty = beforeQty + quantity;

  console.log(
    `[arcade-grant-item] user=${userId} item=${kind}:${code}:${rarity} before=${beforeQty} grant=${quantity} after=${afterQty} apply=${apply}`,
  );

  if (!apply) {
    console.log("[arcade-grant-item] dry-run. Re-run with --apply to write.");
    return;
  }

  await sql`
    INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
    VALUES (
      ${userId}::uuid,
      ${kind},
      ${code},
      ${rarity},
      ${quantity},
      ${sql.json({ source: "admin_grant" })},
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
      AND kind = ${kind}
      AND code = ${code}
      AND rarity = ${rarity}
    LIMIT 1
  `;

  console.log(`[arcade-grant-item] ✅ new_quantity=${Number(after?.quantity ?? 0)}`);
}

main().catch((e) => {
  console.error("[arcade-grant-item] FAILED", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
