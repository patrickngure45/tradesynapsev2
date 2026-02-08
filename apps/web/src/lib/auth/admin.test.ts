import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireAdmin } from "@/lib/auth/admin";

/* ---------- Mock sql tagged-template function ----------
 * postgres.js sql is a tagged-template literal: sql`...`.
 * We mock it as a function that captures calls and returns
 * a pre-configured result array.
 */
function createMockSql(rows: Record<string, unknown>[]) {
  const fn = vi.fn((..._args: unknown[]) => rows);
  // Tagged template invocations pass (strings[], ...values) — wrap so it
  // behaves like a tagged template function when called as sql`...`.
  const sql = new Proxy(fn, {
    apply(_target, _thisArg, args) {
      return fn(...args);
    },
  });
  return { sql: sql as any, fn };
}

/** Build a minimal Request with the given headers */
function fakeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/test", {
    headers: new Headers(headers),
  });
}

// ---------- Tests ----------

describe("requireAdmin", () => {
  beforeEach(() => {
    // In test env ENFORCE_AUTH is not set, so x-user-id header is accepted
    vi.unstubAllEnvs();
  });

  it("returns auth_required when no identity is provided", async () => {
    const { sql } = createMockSql([]);
    const result = await requireAdmin(sql, fakeRequest());
    expect(result).toEqual({ ok: false, error: "auth_required" });
  });

  it("returns user_not_found when user does not exist in DB", async () => {
    const { sql } = createMockSql([]); // empty result set
    const result = await requireAdmin(
      sql,
      fakeRequest({ "x-user-id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
    );
    expect(result).toEqual({ ok: false, error: "user_not_found" });
  });

  it("returns admin_required when user exists but is not admin", async () => {
    const { sql } = createMockSql([{ role: "user" }]);
    const result = await requireAdmin(
      sql,
      fakeRequest({ "x-user-id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
    );
    expect(result).toEqual({ ok: false, error: "admin_required" });
  });

  it("returns ok + userId for an admin user", async () => {
    const uid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const { sql } = createMockSql([{ role: "admin" }]);
    const result = await requireAdmin(sql, fakeRequest({ "x-user-id": uid }));
    expect(result).toEqual({ ok: true, userId: uid });
  });

  it("queries the DB with the extracted userId", async () => {
    const uid = "11111111-2222-3333-4444-555555555555";
    const { sql, fn } = createMockSql([{ role: "admin" }]);
    await requireAdmin(sql, fakeRequest({ "x-user-id": uid }));
    expect(fn).toHaveBeenCalledOnce();
    // The tagged-template call receives [strings, ...values].
    // First interpolated value should be the userId.
    const firstCall = fn.mock.calls[0]!;
    // For tagged templates: fn(strings, val0, val1, ...)
    // The uid is the first interpolated value.
    expect(firstCall).toSatisfy((args: unknown[]) => {
      return JSON.stringify(args).includes(uid);
    });
  });

  it("is resilient to unknown roles", async () => {
    const { sql } = createMockSql([{ role: "superadmin" }]);
    const result = await requireAdmin(
      sql,
      fakeRequest({ "x-user-id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
    );
    // Anything other than 'admin' is rejected
    expect(result).toEqual({ ok: false, error: "admin_required" });
  });
});
