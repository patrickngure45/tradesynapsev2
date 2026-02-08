import { describe, it, expect } from "vitest";
import { createRateLimiter } from "@/lib/rateLimit";

describe("createRateLimiter", () => {
  it("allows requests within limit", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });
    for (let i = 0; i < 5; i++) {
      const result = limiter.consume("ip-1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }
  });

  it("blocks requests exceeding limit", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    limiter.consume("ip-1");
    limiter.consume("ip-1");
    limiter.consume("ip-1");
    const result = limiter.consume("ip-1");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("tracks keys independently", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    limiter.consume("ip-1");
    limiter.consume("ip-1");
    const r1 = limiter.consume("ip-1");
    const r2 = limiter.consume("ip-2");
    expect(r1.allowed).toBe(false);
    expect(r2.allowed).toBe(true);
  });

  it("resets after window expires", () => {
    const limiter = createRateLimiter({ windowMs: 100, max: 1 });
    const r1 = limiter.consume("key");
    expect(r1.allowed).toBe(true);
    const r2 = limiter.consume("key");
    expect(r2.allowed).toBe(false);

    // Wait for window to expire then try again
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const r3 = limiter.consume("key");
        expect(r3.allowed).toBe(true);
        resolve();
      }, 150);
    });
  });

  it("reports limit in result", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });
    const r = limiter.consume("any");
    expect(r.limit).toBe(10);
  });

  it("reports resetMs in the future", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });
    const r = limiter.consume("key");
    expect(r.resetMs).toBeGreaterThan(Date.now());
  });

  it("tracks bucket count", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });
    expect(limiter.size()).toBe(0);
    limiter.consume("a");
    limiter.consume("b");
    expect(limiter.size()).toBe(2);
  });
});
