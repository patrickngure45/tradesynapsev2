import postgres from "postgres";

declare global {
  var __proofpackSql: ReturnType<typeof postgres> | undefined;
}

export function createSql() {
  let databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

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
    max: 10,
    idle_timeout: 20,
    ...(ssl ? { ssl } : {}),
  });
}

export function getSql() {
  if (!globalThis.__proofpackSql) {
    globalThis.__proofpackSql = createSql();
  }
  return globalThis.__proofpackSql;
}
