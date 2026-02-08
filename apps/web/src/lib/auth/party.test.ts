import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/*
 * party.ts reads env vars at import time (top-level `const isProd = ...`).
 * We must set env BEFORE importing so the module snapshot captures test values.
 * Since Vitest isolates modules per file automatically in the `node` environment
 * we can rely on vi.stubEnv before a dynamic import.
 *
 * We test getActingUserId, requireActingUserIdInProd, and isParty.
 */

/** Helper: minimal Request with given headers + optional cookie */
function fakeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/test", { headers: new Headers(headers) });
}

// ────────────────────────────────────────────────────────────────────
// isParty — pure logic, no env dependency
// ────────────────────────────────────────────────────────────────────
describe("isParty", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let isParty: typeof import("@/lib/auth/party").isParty;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("@/lib/auth/party");
    isParty = mod.isParty;
  });

  const trade = { buyer_user_id: "buyer-1", seller_user_id: "seller-1" };

  it("returns true when user is buyer", () => {
    expect(isParty("buyer-1", trade)).toBe(true);
  });

  it("returns true when user is seller", () => {
    expect(isParty("seller-1", trade)).toBe(true);
  });

  it("returns false for a third party", () => {
    expect(isParty("intruder", trade)).toBe(false);
  });

  it("returns false when userId is null", () => {
    expect(isParty(null, trade)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// getActingUserId — dev mode (ENFORCE_AUTH not set, no prod)
// ────────────────────────────────────────────────────────────────────
describe("getActingUserId (dev mode)", () => {
  let getActingUserId: typeof import("@/lib/auth/party").getActingUserId;

  beforeEach(async () => {
    vi.resetModules();
    // Ensure dev mode: no ENFORCE_AUTH, no production
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ENFORCE_AUTH", "");
    vi.stubEnv("PROOFPACK_SESSION_SECRET", "");
    const mod = await import("@/lib/auth/party");
    getActingUserId = mod.getActingUserId;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to x-user-id header in dev mode", () => {
    const uid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(getActingUserId(fakeRequest({ "x-user-id": uid }))).toBe(uid);
  });

  it("returns null when no identity is provided", () => {
    expect(getActingUserId(fakeRequest())).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────
// getActingUserId — with session secret configured
// ────────────────────────────────────────────────────────────────────
describe("getActingUserId (with session secret)", () => {
  const SECRET = "test-secret-key-abc123";
  let getActingUserId: typeof import("@/lib/auth/party").getActingUserId;
  let createSessionToken: typeof import("@/lib/auth/session").createSessionToken;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ENFORCE_AUTH", "");
    vi.stubEnv("PROOFPACK_SESSION_SECRET", SECRET);
    const party = await import("@/lib/auth/party");
    const session = await import("@/lib/auth/session");
    getActingUserId = party.getActingUserId;
    createSessionToken = session.createSessionToken;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("extracts userId from a valid session cookie", () => {
    const uid = "user-abc-123";
    const token = createSessionToken({ userId: uid, secret: SECRET });
    const req = fakeRequest({ cookie: `pp_session=${token}` });
    expect(getActingUserId(req)).toBe(uid);
  });

  it("prefers session cookie over x-user-id header", () => {
    const cookieUid = "from-cookie";
    const token = createSessionToken({ userId: cookieUid, secret: SECRET });
    const req = fakeRequest({
      cookie: `pp_session=${token}`,
      "x-user-id": "from-header",
    });
    expect(getActingUserId(req)).toBe(cookieUid);
  });

  it("rejects an invalid session token and falls back to x-user-id in dev", () => {
    const req = fakeRequest({
      cookie: "pp_session=garbage.invalid",
      "x-user-id": "fallback-user",
    });
    expect(getActingUserId(req)).toBe("fallback-user");
  });

  it("returns null for an expired session token with no header fallback", () => {
    const uid = "expired-user";
    const token = createSessionToken({
      userId: uid,
      secret: SECRET,
      ttlSeconds: 1,
      now: Date.now() - 60_000, // created 60s ago, 1s TTL
    });
    const req = fakeRequest({ cookie: `pp_session=${token}` });
    expect(getActingUserId(req)).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────
// requireActingUserIdInProd — error path
// ────────────────────────────────────────────────────────────────────
describe("requireActingUserIdInProd", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null in dev mode even when user is missing", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ENFORCE_AUTH", "");
    const { requireActingUserIdInProd } = await import("@/lib/auth/party");
    expect(requireActingUserIdInProd(null)).toBeNull();
  });

  it("returns error when ENFORCE_AUTH=1 and user is missing", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ENFORCE_AUTH", "1");
    const { requireActingUserIdInProd } = await import("@/lib/auth/party");
    expect(requireActingUserIdInProd(null)).toBe("missing_x_user_id");
  });

  it("returns null when ENFORCE_AUTH=1 and user id is present", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ENFORCE_AUTH", "1");
    const { requireActingUserIdInProd } = await import("@/lib/auth/party");
    expect(requireActingUserIdInProd("some-user")).toBeNull();
  });
});
