import postgres from "postgres";

declare global {
  var __proofpackSql: ReturnType<typeof postgres> | undefined;
}

export function createSql() {
  let databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const poolMax = (() => {
    const raw = process.env.DB_POOL_MAX;
    if (!raw) return 10;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 10;
    return Math.max(1, Math.min(50, Math.trunc(n)));
  })();

  const connectTimeoutSec = (() => {
    const raw = process.env.DB_CONNECT_TIMEOUT_SEC;
    if (!raw) return 30;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 30;
  })();

  // Accept SQLAlchemy-style URLs (e.g. postgresql+asyncpg://...) by normalizing
  // to a standard URL understood by postgres.js.
  databaseUrl = databaseUrl.replace(/^postgresql\+asyncpg:\/\//i, "postgresql://");
  databaseUrl = databaseUrl.replace(/^postgres\+asyncpg:\/\//i, "postgres://");

  let ssl: false | "require" | undefined;
  try {
    const u = new URL(databaseUrl);
    const sslParam = u.searchParams.get("ssl");
    const sslModeParam = u.searchParams.get("sslmode");
    if (
      sslParam?.toLowerCase() === "require" ||
      sslParam?.toLowerCase() === "true" ||
      sslModeParam?.toLowerCase() === "require"
    ) {
      ssl = "require";
    }
  } catch {
    // If it's not a parseable URL, let postgres.js handle it.
  }

  return postgres(databaseUrl, {
    max: poolMax,
    idle_timeout: 20,
    connect_timeout: connectTimeoutSec,
    ...(ssl ? { ssl } : {}),
  });
}

export function getSql() {
  if (!globalThis.__proofpackSql) {
    globalThis.__proofpackSql = createSql();
  }
  return globalThis.__proofpackSql;
}
