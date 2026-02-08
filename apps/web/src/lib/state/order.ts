/**
 * Exchange order state machine.
 *
 * States:
 *   open              – on-book, no fills yet
 *   partially_filled  – at least one execution, remaining_quantity > 0
 *   filled            – fully filled, remaining_quantity = 0, terminal
 *   canceled          – canceled by user or system, terminal
 *
 * Transitions:
 *   open             → partially_filled  (matcher: partial fill)
 *   open             → filled            (matcher: full fill in one sweep)
 *   open             → canceled          (user cancel API)
 *   partially_filled → partially_filled  (matcher: another partial fill)
 *   partially_filled → filled            (matcher: final fill)
 *   partially_filled → canceled          (user cancel remaining)
 *   filled           → (terminal)
 *   canceled         → (terminal)
 */

export type OrderStatus = "open" | "partially_filled" | "filled" | "canceled";

export function isOrderStatus(s: string): s is OrderStatus {
  return s === "open" || s === "partially_filled" || s === "filled" || s === "canceled";
}

export const ORDER_ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  open: ["partially_filled", "filled", "canceled"],
  partially_filled: ["partially_filled", "filled", "canceled"],
  filled: [],
  canceled: [],
} as const;

/** Can the order move from `from` to `to`? */
export function canTransitionOrder(from: string, to: OrderStatus): boolean {
  if (!isOrderStatus(from)) return false;
  return ORDER_ALLOWED_TRANSITIONS[from].includes(to);
}

/** Is the order in a terminal (immutable) state? */
export function isTerminalOrderStatus(s: string): boolean {
  return s === "filled" || s === "canceled";
}

/** Can the order be canceled from its current status? */
export function canCancelOrder(status: string): boolean {
  return canTransitionOrder(status, "canceled");
}
