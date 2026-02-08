import { describe, it, expect, vi } from "vitest";
import { createPgRateLimiter } from "@/lib/rateLimitPg";

/**
 * Mock for postgres.js tagged-template sql function.
 * Captures calls and returns pre-configured rows.
 */
function createMockSql(rowsFn: (...args: unknown[]) => Record<string, unknown>[]) {
  const fn = vi.fn((...args: unknown[]) => rowsFn(...args));
  const sql = new Proxy(fn, {
    apply(_target, _thisArg, args) {
      return Promise.resolve(fn(...args));
    },
  });
  return { sql: sql as any, fn };
}

describe("createPgRateLimiter", () => {
  it("returns allowed with remaining tokens on first request", async () => {
    const { sql } = createMockSql(() => [
      { tokens: 119, window_start_ms: BigInt(Date.now()) },
    ]);

    const limiter = createPgRateLimiter(sql, { name: "api", windowMs: 60_000, max: 120 });
    const result = await limiter.consume("192.168.1.1");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(119);
    expect(result.limit).toBe(120);
    expect(result.resetMs).toBeGreaterThan(Date.now() - 1000);
  });

  it("returns blocked when tokens are exhausted", async () => {
    const { sql } = createMockSql(() => [
      { tokens: -1, window_start_ms: BigInt(Date.now()) },
    ]);

    const limiter = createPgRateLimiter(sql, { name: "auth", windowMs: 60_000, max: 20 });
    const result = await limiter.consume("10.0.0.1");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(20);
  });

  it("returns allowed when exactly at zero tokens", async () => {
    const { sql } = createMockSql(() => [
      { tokens: 0, window_start_ms: BigInt(Date.now()) },
    ]);

    const limiter = createPgRateLimiter(sql, { name: "api", windowMs: 60_000, max: 120 });
    const result = await limiter.consume("10.0.0.1");

    // 0 tokens means the bucket just hit the limit — this request was the last allowed one
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("computes resetMs from window_start_ms + windowMs", async () => {
    const now = Date.now();
    const windowMs = 30_000;
    const { sql } = createMockSql(() => [
      { tokens: 5, window_start_ms: BigInt(now) },
    ]);

    const limiter = createPgRateLimiter(sql, { name: "test", windowMs, max: 10 });
    const result = await limiter.consume("key");

    expect(result.resetMs).toBe(now + windowMs);
  });

  it("passes the correct limiter name", async () => {
    const { sql, fn } = createMockSql(() => [
      { tokens: 9, window_start_ms: BigInt(Date.now()) },
    ]);

    const limiter = createPgRateLimiter(sql, { name: "exchange-write", windowMs: 60_000, max: 40 });
    expect(limiter.name).toBe("exchange-write");

    await limiter.consume("1.2.3.4");
    expect(fn).toHaveBeenCalledOnce();
    // The SQL tagged template receives the name as an interpolated value
    const callArgs = fn.mock.calls[0]!;
    expect(JSON.stringify(callArgs)).toContain("exchange-write");
    expect(JSON.stringify(callArgs)).toContain("1.2.3.4");
  });

  it("uses default options when not specified", async () => {
    const { sql } = createMockSql(() => [
      { tokens: 59, window_start_ms: BigInt(Date.now()) },
    ]);

    // Only name is required — windowMs defaults to 60000, max to 60
    const limiter = createPgRateLimiter(sql, { name: "default" });
    const result = await limiter.consume("key");

    expect(result.limit).toBe(60);
    expect(result.remaining).toBe(59);
    expect(result.allowed).toBe(true);
  });
});
