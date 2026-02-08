export type TradeStatus =
  | "created"
  | "awaiting_payment"
  | "paid_marked"
  | "released"
  | "disputed"
  | "resolved"
  | "canceled";

export function isTradeStatus(status: string): status is TradeStatus {
  return (
    status === "created" ||
    status === "awaiting_payment" ||
    status === "paid_marked" ||
    status === "released" ||
    status === "disputed" ||
    status === "resolved" ||
    status === "canceled"
  );
}

export const TRADE_ALLOWED_TRANSITIONS: Record<TradeStatus, readonly TradeStatus[]> = {
  created: ["awaiting_payment", "disputed", "canceled"],
  awaiting_payment: ["paid_marked", "disputed", "canceled"],
  paid_marked: ["released", "disputed", "resolved", "canceled"],
  released: ["resolved", "disputed"],
  disputed: ["resolved"],
  resolved: [],
  canceled: [],
} as const;

export function canTransitionTrade(from: string, to: TradeStatus): boolean {
  if (!isTradeStatus(from)) return false;
  return TRADE_ALLOWED_TRANSITIONS[from].includes(to);
}

export function canOpenDispute(tradeStatus: string): boolean {
  // Dispute opening implies a trade transition into 'disputed'.
  return canTransitionTrade(tradeStatus, "disputed");
}

export function canResolveFromDispute(tradeStatus: string): boolean {
  // Decisions should only resolve/cancel a trade that is currently in dispute.
  return tradeStatus === "disputed";
}
