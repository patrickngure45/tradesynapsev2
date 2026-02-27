# Coinwaka Build Plan (2026)

This file is the single source of truth for what we’re building next, why, and in what order.

See also: MASTER_TODO.md for the full end-to-end completion roadmap.

## Product decisions (locked)

- **Real user** = `email + password` (phone optional; not required).
- **Core daily loop** = *check portfolio → watchlist/alerts → execute (buy/sell/convert) → review activity → notifications*.
- **AI stance**: AI is for **explainability**, **support reduction**, and **ops/risk summarization**.
  - We do **not** ship “AI trading signals” or prediction-based copy in V1.

## Phase 1 (Now): Daily Use Loop

### 1. Home / Portfolio Hub

- [x] New `/home` page (logged-in friendly) with:
  - balances snapshot
  - quick actions (Wallet / Withdraw / P2P / Order history)
  - activity preview
  - watchlist widget

### 2. Watchlist

- [x] Persistent watchlist stored server-side (per user)
- [x] UI: add/remove assets

### 3. Price alerts

- [x] Create threshold alerts (above/below) per asset + fiat
- [x] Cron endpoint to evaluate alerts and emit notifications
- [x] Notifications type: `price_alert`

## Phase 2: Trust surfaces

- [x] In-app status page (deposits/withdrawals/outbox/db)
- [x] Proof-of-operations snapshot (non-marketing, factual)

## Phase 3: Automation

- [x] Recurring buys (DCA) with strict caps and idempotency

## Phase 4: Explainability

- [x] “Explain” endpoints for withdrawal/order/p2p states (reason codes → plain English)
- [x] Optional AI rephrase layer (rules-first, AI second)

## Notes

- Keep changes incremental and shippable.
- Avoid adding new theme primitives; use existing `var(--*)` tokens.
