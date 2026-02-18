
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL must be set");

  const isIgnorableDriftForFile = (file: string, err: unknown) => {
    // Narrowly scoped compatibility: some deployments may restore/seed a DB
    // that already includes columns/indexes but lacks corresponding _migrations rows.
    if (file !== "026_fee_preference_deprecated.sql") return false;
    const anyErr = err as any;
    const code = anyErr?.code as string | undefined;
    // 42701: duplicate_column, 42P07: duplicate_table (also used for relations like indexes)
    return code === "42701" || code === "42P07";
  };

  let dbHost = "unknown";
  let dbName = "unknown";
  let ssl: false | "require" | undefined;
  try {
    const u = new URL(dbUrl);
    dbHost = u.host;
    dbName = u.pathname.replace(/^\//, "") || "unknown";
    const sslModeParam = u.searchParams.get("sslmode")?.toLowerCase();
    if (sslModeParam === "require") ssl = "require";

    // Many hosted Postgres providers require TLS even without sslmode=require.
    if (!ssl && /\brlwy\.net\b/i.test(u.host)) ssl = "require";
  } catch {
    // ignore
  }

  const sql = postgres(dbUrl, {
    max: 1,
    onnotice: () => {},
    connect_timeout: Number(process.env.DB_CONNECT_TIMEOUT_SEC ?? 60) || 60,
    idle_timeout: 20,
    ...(ssl ? { ssl } : {}),
  });

  console.log(`🔌 Connected to database: ${dbHost}/${dbName}`);

  // Avoid concurrent migrations across multiple Railway services.
  // Session-level lock is released automatically when the process exits.
  const MIGRATION_LOCK_KEY = "tradesynapse:db:migrate:v1";

  try {
    console.log("🔒 Acquiring migration lock...");
    await sql`SELECT pg_advisory_lock(hashtext(${MIGRATION_LOCK_KEY}))`;

    console.log("⏱️ Setting statement_timeout...");
    await sql`SET statement_timeout = '60s'`;

    console.log("✅ DB ping...");
    await sql`SELECT 1`;

    // 1. Ensure migrations table
    console.log("🧱 Ensuring _migrations table...");
    await sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        id serial PRIMARY KEY,
        name text NOT NULL UNIQUE,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    // 2. Read local migration files
    // Assuming this script is at apps/web/scripts/db-migrate.ts
    // And migrations are at db/migrations relative to repo root (../../db/migrations)
    console.log("📁 Locating migrations dir...");
    const migrationsDir = path.resolve(__dirname, "../../../db/migrations");
    
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found at: ${migrationsDir}`);
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort(); // Alphanumeric sort ensures 001 < 002

    console.log(`📂 Found ${files.length} migration files.`);

    // 3. Check applied status
    console.log("📌 Loading applied migrations...");
    const appliedRows = await sql`SELECT name FROM _migrations`;
    const applied = new Set(appliedRows.map((r) => r.name));

    // 4. Apply pending
    for (const file of files) {
      if (applied.has(file)) continue;

      console.log(`▶️ Applying ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const content = fs.readFileSync(filePath, "utf8");

      await sql.begin(async (tx) => {
        try {
          // Run the SQL
          await tx.unsafe(content);
        } catch (err) {
          if (isIgnorableDriftForFile(file, err)) {
            console.warn(`⚠️  Migration ${file} hit an "already exists" drift; marking as applied.`);
          } else {
            throw err;
          }
        }

        // Record it (even if we no-opped due to drift)
        // @ts-ignore
        await tx`INSERT INTO _migrations (name) VALUES (${file})`;
      });

      console.log(`✅ Applied ${file}`);
    }

    console.log("✨ All migrations up to date.");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    try {
      await sql`SELECT pg_advisory_unlock(hashtext(${MIGRATION_LOCK_KEY}))`;
    } catch {
      // ignore
    }
    await sql.end();
  }
}

main();
