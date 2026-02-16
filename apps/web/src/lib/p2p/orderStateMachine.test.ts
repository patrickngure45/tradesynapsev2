import { describe, it, expect } from "vitest";
import { canPerformP2POrderAction } from "@/lib/p2p/orderStateMachine";

describe("canPerformP2POrderAction", () => {
  const nowMs = 1_000_000;

  it("allows buyer to PAY_CONFIRMED only from created and before expiry", () => {
    expect(
      canPerformP2POrderAction({
        status: "created",
        action: "PAY_CONFIRMED",
        actorRole: "buyer",
        nowMs,
        expiresAtMs: nowMs + 1,
      })
    ).toEqual({ ok: true });

    const expired = canPerformP2POrderAction({
      status: "created",
      action: "PAY_CONFIRMED",
      actorRole: "buyer",
      nowMs,
      expiresAtMs: nowMs - 1,
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) {
      expect(expired.code).toBe("order_state_conflict");
      expect(expired.httpStatus).toBe(409);
    }
  });

  it("rejects PAY_CONFIRMED by seller", () => {
    expect(
      canPerformP2POrderAction({
        status: "created",
        action: "PAY_CONFIRMED",
        actorRole: "seller",
        nowMs,
        expiresAtMs: null,
      })
    ).toEqual({ ok: false, code: "actor_not_allowed", httpStatus: 403 });
  });

  it("allows seller to RELEASE only from paid_confirmed", () => {
    expect(
      canPerformP2POrderAction({
        status: "paid_confirmed",
        action: "RELEASE",
        actorRole: "seller",
        nowMs,
        expiresAtMs: null,
      })
    ).toEqual({ ok: true });

    expect(
      canPerformP2POrderAction({
        status: "created",
        action: "RELEASE",
        actorRole: "seller",
        nowMs,
        expiresAtMs: null,
      })
    ).toEqual({ ok: false, code: "order_state_conflict", httpStatus: 409 });
  });

  it("allows buyer to CANCEL from created anytime; seller only after expiry", () => {
    expect(
      canPerformP2POrderAction({
        status: "created",
        action: "CANCEL",
        actorRole: "buyer",
        nowMs,
        expiresAtMs: null,
      })
    ).toEqual({ ok: true });

    expect(
      canPerformP2POrderAction({
        status: "created",
        action: "CANCEL",
        actorRole: "seller",
        nowMs,
        expiresAtMs: nowMs + 10,
      })
    ).toEqual({
      ok: false,
      code: "actor_not_allowed",
      httpStatus: 403,
      message: "Seller can only cancel after the payment window expires.",
    });

    expect(
      canPerformP2POrderAction({
        status: "created",
        action: "CANCEL",
        actorRole: "seller",
        nowMs,
        expiresAtMs: nowMs - 10,
      })
    ).toEqual({ ok: true });
  });

  it("rejects actions in terminal or disputed states", () => {
    for (const status of ["completed", "cancelled", "disputed"] as const) {
      const res = canPerformP2POrderAction({
        status,
        action: "CANCEL",
        actorRole: "buyer",
        nowMs,
        expiresAtMs: null,
      });
      expect(res).toEqual({ ok: false, code: "order_state_conflict", httpStatus: 409 });
    }
  });
});
