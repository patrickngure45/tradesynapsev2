import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

/** Build a minimal Request with the given headers */
function fakeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/test", { headers: new Headers(headers) });
}

// ────────────────────────────────────────────────────────────────────
// safeCompare
// ────────────────────────────────────────────────────────────────────
describe("safeCompare", () => {
  let safeCompare: typeof import("@/lib/auth/keys").safeCompare;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("@/lib/auth/keys");
    safeCompare = mod.safeCompare;
  });

  it("returns true for identical strings", () => {
    expect(safeCompare("secret123", "secret123")).toBe(true);
  });

  it("returns false for different strings", () => {
    expect(safeCompare("secret123", "wrong")).toBe(false);
  });

  it("returns false for empty vs non-empty", () => {
    expect(safeCompare("", "secret")).toBe(false);
    expect(safeCompare("secret", "")).toBe(false);
  });

  it("returns false for non-string inputs", () => {
    expect(safeCompare(null as any, "a")).toBe(false);
    expect(safeCompare("a", undefined as any)).toBe(false);
    expect(safeCompare(123 as any, 123 as any)).toBe(false);
  });

  it("handles Unicode strings", () => {
    expect(safeCompare("héllo", "héllo")).toBe(true);
    expect(safeCompare("héllo", "hello")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// requireKey
// ────────────────────────────────────────────────────────────────────
describe("requireKey", () => {
  let requireKey: typeof import("@/lib/auth/keys").requireKey;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test"); // non-production
    const mod = await import("@/lib/auth/keys");
    requireKey = mod.requireKey;
  });

  it("passes in dev when no env key is configured (open gate)", () => {
    const result = requireKey({
      envKey: undefined,
      headerValue: undefined,
      notConfiguredError: "not_configured",
      invalidError: "invalid",
    });
    expect(result).toEqual({ ok: true });
  });

  it("passes when header matches configured key", () => {
    const result = requireKey({
      envKey: "my-secret",
      headerValue: "my-secret",
      notConfiguredError: "not_configured",
      invalidError: "invalid",
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects when header does not match configured key", () => {
    const result = requireKey({
      envKey: "my-secret",
      headerValue: "wrong-key",
      notConfiguredError: "not_configured",
      invalidError: "invalid",
    });
    expect(result).toEqual({ ok: false, error: "invalid" });
  });

  it("rejects when header is missing but key is configured", () => {
    const result = requireKey({
      envKey: "my-secret",
      headerValue: null,
      notConfiguredError: "not_configured",
      invalidError: "invalid",
    });
    expect(result).toEqual({ ok: false, error: "invalid" });
  });

  it("rejects when header is empty string but key is configured", () => {
    const result = requireKey({
      envKey: "my-secret",
      headerValue: "",
      notConfiguredError: "not_configured",
      invalidError: "invalid",
    });
    expect(result).toEqual({ ok: false, error: "invalid" });
  });
});

// ────────────────────────────────────────────────────────────────────
// requireKey — production mode
// ────────────────────────────────────────────────────────────────────
describe("requireKey (production)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects with notConfiguredError in prod when env key is missing", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const { requireKey: requireKeyProd } = await import("@/lib/auth/keys");
    const result = requireKeyProd({
      envKey: undefined,
      headerValue: "something",
      notConfiguredError: "not_configured",
      invalidError: "invalid",
    });
    expect(result).toEqual({ ok: false, error: "not_configured" });
  });
});

// ────────────────────────────────────────────────────────────────────
// requireAdminKey — convenience wrapper
// ────────────────────────────────────────────────────────────────────
describe("requireAdminKey", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("passes when x-admin-key matches EXCHANGE_ADMIN_KEY", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("EXCHANGE_ADMIN_KEY", "admin-pass-123");
    const { requireAdminKey } = await import("@/lib/auth/keys");
    const result = requireAdminKey(fakeRequest({ "x-admin-key": "admin-pass-123" }));
    expect(result).toEqual({ ok: true });
  });

  it("rejects when x-admin-key is wrong", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("EXCHANGE_ADMIN_KEY", "admin-pass-123");
    const { requireAdminKey } = await import("@/lib/auth/keys");
    const result = requireAdminKey(fakeRequest({ "x-admin-key": "nope" }));
    expect(result).toEqual({ ok: false, error: "admin_key_invalid" });
  });

  it("rejects with not_configured in prod when env is missing", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EXCHANGE_ADMIN_KEY", "");
    const { requireAdminKey } = await import("@/lib/auth/keys");
    const result = requireAdminKey(fakeRequest({ "x-admin-key": "abc" }));
    expect(result).toEqual({ ok: false, error: "admin_key_not_configured" });
  });
});

// ────────────────────────────────────────────────────────────────────
// requireReviewerKey — convenience wrapper
// ────────────────────────────────────────────────────────────────────
describe("requireReviewerKey", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("passes when x-reviewer-key matches", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PROOFPACK_REVIEWER_KEY", "rev-key");
    const { requireReviewerKey } = await import("@/lib/auth/keys");
    const result = requireReviewerKey(fakeRequest({ "x-reviewer-key": "rev-key" }));
    expect(result).toEqual({ ok: true });
  });

  it("rejects when x-reviewer-key doesn't match", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PROOFPACK_REVIEWER_KEY", "rev-key");
    const { requireReviewerKey } = await import("@/lib/auth/keys");
    const result = requireReviewerKey(fakeRequest({ "x-reviewer-key": "wrong" }));
    expect(result).toEqual({ ok: false, error: "reviewer_key_invalid" });
  });
});
