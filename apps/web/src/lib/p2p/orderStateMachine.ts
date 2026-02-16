export type P2POrderStatus =
  | "created"
  | "paid_confirmed"
  | "completed"
  | "cancelled"
  | "disputed";

export type P2POrderAction = "PAY_CONFIRMED" | "RELEASE" | "CANCEL";

export type P2PActorRole = "buyer" | "seller";

export type GuardResult =
  | { ok: true }
  | { ok: false; code: string; httpStatus: number; message?: string };

export function canPerformP2POrderAction(params: {
  status: string;
  action: P2POrderAction;
  actorRole: P2PActorRole;
  nowMs: number;
  expiresAtMs: number | null;
}): GuardResult {
  const status = params.status as P2POrderStatus;
  const { action, actorRole, nowMs, expiresAtMs } = params;

  // terminal states
  if (status === "completed" || status === "cancelled") {
    return { ok: false, code: "order_state_conflict", httpStatus: 409 };
  }
  if (status === "disputed") {
    return { ok: false, code: "order_state_conflict", httpStatus: 409 };
  }

  if (action === "PAY_CONFIRMED") {
    if (actorRole !== "buyer") return { ok: false, code: "actor_not_allowed", httpStatus: 403 };
    if (status !== "created") return { ok: false, code: "order_state_conflict", httpStatus: 409 };
    if (expiresAtMs !== null && expiresAtMs < nowMs) {
      return { ok: false, code: "order_state_conflict", httpStatus: 409, message: "Order has expired." };
    }
    return { ok: true };
  }

  if (action === "RELEASE") {
    if (actorRole !== "seller") return { ok: false, code: "actor_not_allowed", httpStatus: 403 };
    if (status !== "paid_confirmed") return { ok: false, code: "order_state_conflict", httpStatus: 409 };
    return { ok: true };
  }

  // CANCEL
  if (status !== "created") return { ok: false, code: "order_state_conflict", httpStatus: 409 };
  if (actorRole === "buyer") return { ok: true };
  // seller cancellation allowed only after expiry
  if (expiresAtMs !== null && expiresAtMs < nowMs) return { ok: true };
  return {
    ok: false,
    code: "actor_not_allowed",
    httpStatus: 403,
    message: "Seller can only cancel after the payment window expires.",
  };
}
