import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

import { getSql } from "@/lib/db";
import {
  isTransientDbError,
  responseForDbError,
  retryOnceOnTransientDbError,
} from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_EXPECTED_MIGRATIONS = ["001_init.sql", "002_trade_fair_price.sql"] as const;

function findMigrationsDir(): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "db/migrations"),
    path.resolve(cwd, "../db/migrations"),
    path.resolve(cwd, "../../db/migrations"),
    path.resolve(cwd, "../../../db/migrations"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

function loadExpectedMigrations(): string[] {
  const dir = findMigrationsDir();
  if (!dir) return [...FALLBACK_EXPECTED_MIGRATIONS];
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return [...FALLBACK_EXPECTED_MIGRATIONS];
  }
}

async function inferAppliedMigrations(sql: ReturnType<typeof getSql>): Promise<string[]> {
  const inferred: string[] = [];

  // 001_init.sql creates app_user and trade (among others).
  const appUserReg = await retryOnceOnTransientDbError(async () => {
    return await sql<{ reg: string | null }[]>`
      select to_regclass('public.app_user') as reg
    `;
  });
  if (appUserReg[0]?.reg) {
    inferred.push("001_init.sql");
  }

  // 002_trade_fair_price.sql adds fair_price_mid column to trade.
  const fairPriceCol = await retryOnceOnTransientDbError(async () => {
    return await sql<{ ok: number }[]>`
      select 1 as ok
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'trade'
        and column_name = 'fair_price_mid'
      limit 1
    `;
  });
  if (fairPriceCol.length > 0) {
    inferred.push("002_trade_fair_price.sql");
  }

  return inferred;
}

async function readAppliedFromMigrationsTable(sql: ReturnType<typeof getSql>): Promise<string[]> {
  const rows = await retryOnceOnTransientDbError(async () => {
    return await sql<{ name: string }[]>`
      select name
      from _migrations
      order by name asc
    `;
  });
  return rows.map((r) => r.name);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const simulateTransient = url.searchParams.get("simulate_transient_db") === "1";
    if (simulateTransient) {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }

      const simulated = Object.assign(new Error("simulated transient db error"), {
        code: "ECONNRESET",
      });
      const resp = responseForDbError("health.db", simulated);
      if (resp) return resp;
      throw simulated;
    }

    const sql = getSql();

    const isUndefinedTableError = (err: unknown, tableName: string): boolean => {
      if (!err || typeof err !== "object") return false;
      const anyErr = err as { code?: unknown; message?: unknown };
      const code = typeof anyErr.code === "string" ? anyErr.code : "";
      const msg = typeof anyErr.message === "string" ? anyErr.message : "";
      if (code.toUpperCase() === "42P01") return true;
      return msg.toLowerCase().includes(tableName.toLowerCase()) && msg.toLowerCase().includes("does not exist");
    };

    // Basic connectivity check.
    await retryOnceOnTransientDbError(async () => {
      await sql`select 1 as ok`;
    });

    // Migration status (best-effort; tables may not exist yet).
    let applied: string[] = [];
    let schemaMigrationsTablePresent = true;
    let underscoreMigrationsTablePresent = true;
    try {
      const rows = await retryOnceOnTransientDbError(async () => {
        return await sql<{ filename: string }[]>`
          select filename
          from schema_migrations
          order by filename asc
        `;
      });
      applied = rows.map((r) => r.filename);
    } catch (e) {
      if (isTransientDbError(e)) throw e;
      if (!isUndefinedTableError(e, "schema_migrations")) throw e;
      schemaMigrationsTablePresent = false;

      // Prefer our app's migration table if present.
      try {
        applied = await readAppliedFromMigrationsTable(sql);
      } catch (e2) {
        if (isTransientDbError(e2)) throw e2;
        if (!isUndefinedTableError(e2, "_migrations")) throw e2;
        underscoreMigrationsTablePresent = false;
        applied = await inferAppliedMigrations(sql);
      }
    }

    const expected = loadExpectedMigrations();
    const appliedSet = new Set(applied);
    const pending = expected.filter((f) => !appliedSet.has(f));

    const body = {
      ok: true,
      db: { ok: true },
      migrations: {
        expected,
        applied,
        pending,
        schema_migrations_table_present: schemaMigrationsTablePresent,
        _migrations_table_present: underscoreMigrationsTablePresent,
        ok: pending.length === 0,
      },
    };

    return NextResponse.json(body, { status: body.migrations.ok ? 200 : 206 });
  } catch (err) {
    const resp = responseForDbError("health.db", err);
    if (resp) return resp;
    throw err;
  }
}
