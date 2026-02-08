import { apiUpstreamUnavailable } from "@/lib/api/errors";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const anyErr = err as { code?: unknown };
  return typeof anyErr.code === "string" ? anyErr.code : undefined;
}

function getErrorMessage(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  const anyErr = err as { message?: unknown };
  return typeof anyErr.message === "string" ? anyErr.message : String(err);
}

export function isTransientDbError(err: unknown): boolean {
  const code = (getErrorCode(err) ?? "").toUpperCase();
  const msg = getErrorMessage(err);

  // postgres.js (and some serverless poolers) commonly surface these.
  const transientCodes = new Set([
    "CONNECTION_CLOSED",
    "CONNECTION_ENDED",
    "CONNECTION_DESTROYED",
    "ECONNRESET",
    "ETIMEDOUT",
    "EPIPE",
    "ENOTFOUND",
  ]);
  if (code && transientCodes.has(code)) return true;

  // SQLSTATE classes for connection / availability issues.
  // 08xxx: connection exception, 57P0x: operator intervention.
  const transientSqlState = new Set([
    "08000",
    "08003",
    "08006",
    "08001",
    "08004",
    "57P01",
    "57P02",
    "57P03",
    "53300", // too_many_connections
  ]);
  if (code && transientSqlState.has(code)) return true;

  if (
    /CONNECTION_CLOSED|connection\s+terminated|terminating\s+connection|socket\s+hang\s+up|ECONNRESET|EPIPE/i.test(
      msg
    )
  ) {
    return true;
  }

  return false;
}

export async function retryOnceOnTransientDbError<T>(
  fn: () => Promise<T>,
  init?: { delayMs?: number }
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isTransientDbError(e)) throw e;
    await sleep(init?.delayMs ?? 50);
    return await fn();
  }
}

export function responseForDbError(op: string, err: unknown): Response | null {
  if (!isTransientDbError(err)) return null;

  return apiUpstreamUnavailable(
    {
      dependency: "db",
      op,
    },
    { retryAfterSeconds: 3 }
  );
}
