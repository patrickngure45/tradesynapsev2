import { describe, it, expect } from "vitest";
import { z, ZodError } from "zod";
import { statusForApiError, apiError, apiZodError } from "@/lib/api/errors";

// ────────────────────────────────────────────────────────────────────
// statusForApiError — HTTP status mapping
// ────────────────────────────────────────────────────────────────────
describe("statusForApiError", () => {
  // 401 — AuthN
  it.each([
    "missing_x_user_id",
    "missing_user_id",
    "reviewer_key_invalid",
    "session_bootstrap_key_invalid",
    "admin_key_invalid",
    "session_token_expired",
  ])("maps %s → 401", (code) => {
    expect(statusForApiError(code)).toBe(401);
  });

  // 403 — AuthZ
  it.each([
    "not_party",
    "opened_by_not_party",
    "x_user_id_mismatch",
    "actor_not_allowed",
    "withdrawal_address_not_allowlisted",
    "user_not_active",
    "buyer_not_active",
    "seller_not_active",
  ])("maps %s → 403", (code) => {
    expect(statusForApiError(code)).toBe(403);
  });

  // 404 — Not found
  it.each([
    "not_found",
    "trade_not_found",
    "dispute_not_found",
    "user_not_found",
    "market_not_found",
    "order_not_found",
  ])("maps %s → 404", (code) => {
    expect(statusForApiError(code)).toBe(404);
  });

  // 409 — Conflict
  it.each([
    "trade_transition_not_allowed",
    "insufficient_balance",
    "order_state_conflict",
    "market_disabled",
    "post_only_would_take",
    "fok_insufficient_liquidity",
    "idempotency_key_conflict",
    "open_orders_limit",
    "order_notional_too_large",
  ])("maps %s → 409", (code) => {
    expect(statusForApiError(code)).toBe(409);
  });

  // 429 — Rate limit
  it("maps rate_limit_exceeded → 429", () => {
    expect(statusForApiError("rate_limit_exceeded")).toBe(429);
  });

  // 400 — Validation
  it.each([
    "invalid_input",
    "price_not_multiple_of_tick",
    "quantity_not_multiple_of_lot",
  ])("maps %s → 400", (code) => {
    expect(statusForApiError(code)).toBe(400);
  });

  // 500 — Server misconfig
  it.each([
    "reviewer_key_not_configured",
    "session_secret_not_configured",
    "admin_key_not_configured",
  ])("maps %s → 500", (code) => {
    expect(statusForApiError(code)).toBe(500);
  });

  // 503 — Upstream
  it("maps upstream_unavailable → 503", () => {
    expect(statusForApiError("upstream_unavailable")).toBe(503);
  });

  // Unknown → 400 default
  it("defaults unknown codes to 400", () => {
    expect(statusForApiError("some_random_code")).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────────────
// apiError — Response construction
// ────────────────────────────────────────────────────────────────────
describe("apiError", () => {
  it("returns a Response with correct status and JSON body", async () => {
    const res = apiError("not_found");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "not_found" });
  });

  it("includes details when provided", async () => {
    const res = apiError("invalid_input", { details: { field: "email" } });
    const body = await res.json();
    expect(body).toEqual({ error: "invalid_input", details: { field: "email" } });
  });

  it("allows status override", async () => {
    const res = apiError("custom_error", { status: 418 });
    expect(res.status).toBe(418);
  });

  it("adds Retry-After header for upstream_unavailable", async () => {
    const res = apiError("upstream_unavailable");
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("3");
  });

  it("does not add Retry-After for non-upstream errors", async () => {
    const res = apiError("not_found");
    expect(res.headers.get("Retry-After")).toBeNull();
  });

  it("preserves custom headers", async () => {
    const res = apiError("rate_limit_exceeded", {
      headers: { "X-RateLimit-Reset": "1700000000" },
    });
    expect(res.headers.get("X-RateLimit-Reset")).toBe("1700000000");
  });
});

// ────────────────────────────────────────────────────────────────────
// apiZodError — Zod validation wrapping
// ────────────────────────────────────────────────────────────────────
describe("apiZodError", () => {
  it("returns null for non-ZodError", () => {
    expect(apiZodError(new Error("not zod"))).toBeNull();
    expect(apiZodError("string error")).toBeNull();
    expect(apiZodError(null)).toBeNull();
  });

  it("wraps a ZodError into invalid_input response with issues", async () => {
    const schema = z.object({ name: z.string() });
    let zodErr: ZodError | null = null;
    try {
      schema.parse({ name: 42 });
    } catch (e) {
      zodErr = e as ZodError;
    }
    expect(zodErr).toBeTruthy();

    const res = apiZodError(zodErr!);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);

    const body = await res!.json();
    expect(body.error).toBe("invalid_input");
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);
    expect(body.details[0]).toHaveProperty("message");
  });
});
