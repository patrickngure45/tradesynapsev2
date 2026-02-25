# Coinwaka Platform Spec — Custodial, Binance-Scale (2026)

This document extends the v2 MVP spec in DESIGN_V2_SPEC.md into a **platform blueprint** that can grow to include:
- Trading: Convert, Spot, Margin, Futures/Perps, Options, Leveraged tokens, P2P, Demo, Copy, Bots
- Earn: Simple/Locked earn, Lending/Loans, Launchpool-style staking rewards, structured products
- Token launch: Launchpad-style sale/subscriptions, task-based reward programs
- Wallet/Web3: custodial wallet first; optional non-custodial Web3 wallet later as a separate custody domain
- NFTs: marketplace + minting (optional later)
- Payments: Pay, Card, Gift cards (optional later)
- Institutional: OTC, custody reports, higher limits, subaccounts
- Support/Education: Academy + support center

This repo already contains strong foundations for custodial rails:
- Ledger + holds + outbox + audit patterns
- Deposits/withdrawals (BSC-first)
- Spot exchange markets/orders (plus conditional orders migrations)
- Convert quote/execute library
- P2P escrow + disputes
- Bots + copy-trading schema stubs

The goal is to **design everything** so new modules plug into the same safety and accounting primitives.

---

## 0) Non-negotiable platform invariants

1) One source of truth for money movements
- All custodial value changes must be ledgered.
- Holds must be used for any action that can fail/settle asynchronously (orders, P2P escrow, margin borrows, liquidations, earn lockups).

2) Idempotent state transitions
- Every external side effect (chain tx, email, bot execution, liquidation) must be outbox-driven.
- Every user-initiated write must be safe to retry.

3) Transparent, explainable state
- Every product must provide a user-facing “why is my money locked/pending?” explanation using stable reason codes.

4) Compliance gating is a first-class constraint
- Feature availability depends on region, KYC tier, user risk tier, and account age/limits.

5) Operational separation
- Website uptime must not depend on chain scanners, sweepers, or heavy matching loops.
- Workers run separately where possible.

---

## 1) Product IA (information architecture)

We keep the v2 mobile-first bottom navigation as the stable spine:
- Markets
- Trade
- Orders
- Wallet
- Account

Platform expansion fits into this IA without forcing a redesign:

### Markets
- Spot markets (default)
- Derivatives markets (when enabled): Perps/Quarterlies

### Trade
- Convert (simple swap)
- Spot (order book trading)
- Margin (same UI, different account mode)
- Derivatives (perp/futures order entry)
- Demo (simulated balances; training wheels)

### Orders
- Spot orders
- Margin orders
- Derivatives orders
- Copy trades / bot runs (history + controls)

### Wallet
- Custodial balances (spot/margin/derivatives subaccounts)
- Deposits/withdrawals/transfer between subaccounts
- Earn positions (locked/flexible)

### Account
- Security, sessions, 2FA
- Verification (email + KYC)
- Preferences
- Support
- (Optional) Academy
- (Optional) Referral

P2P can be:
- A sub-surface under Trade (beginner-friendly), or
- A first-class entry under Wallet (fiat on/off ramp), depending on your onboarding strategy.

---

## 2) Core modules (what we ship and how they plug in)

### A) Identity, Access, Compliance
Responsibilities
- Authentication + session
- KYC submissions + tier state
- Region gating
- Limits + risk scoring

Key concepts
- KYC tier: None / Basic / Verified / Enhanced
- Feature flags per user: derivatives_enabled, margin_enabled, earn_enabled, p2p_enabled
- Limits: daily withdrawal limits, order notional caps, leverage caps

### B) Custodial Wallet Rails (ledger, holds, journals)
Responsibilities
- Assets, accounts, balances
- Holds for pending states
- Journals for every movement
- Auditable history

Key concepts
- Account domains: spot, margin, derivatives, earn, treasury, fees, insurance
- Transfers between domains are ledger transfers (not magic)

### C) Deposits & Withdrawals (chain integration)
Responsibilities
- Address derivation / assignment
- Scanning chain logs
- Confirmations and crediting
- Withdrawal requests, approvals, signing/broadcast

Required design
- Scanning/crediting in workers; web only serves UI + status
- Sweep is optional housekeeping and must never block crediting

### D) Spot Exchange
Responsibilities
- Markets (base/quote)
- Order placement + cancel
- Matching + executions
- Fees and user trade history

Order types
- Market, limit (already)
- Stop-limit / OCO / trailing stop via conditional-order trigger worker

### E) Convert (simple buy/sell/convert)
Responsibilities
- Quote mid price using trusted sources
- Apply simple fee
- Execute by journaling: debit asset A, credit asset B, collect fee

Notes
- Convert is *not* an order book product.
- Convert can be extended into “Simple Buy/Sell” later by adding fiat rails; until then it remains crypto↔crypto.

### F) P2P Escrow
Responsibilities
- Ads, orders, escrow holds
- Disputes & moderation
- Reputation

Notes
- P2P is the fiat on/off ramp in many regions.

### G) Automation: Bots + Copy Trading
Responsibilities
- Bot strategy runner (simulation-first, then optional live)
- Copy leaderboards and subscriptions
- Risk controls: caps, max drawdown, kill switch

Notes
- The platform must treat bots/copy as *order generators* that still use the same order placement APIs and limits.

---

## 3) Pro trading extensions

### A) Margin Trading (custodial)
Core requirements
- Borrow/lend pools per asset
- Interest accrual (hourly or per-block bucket)
- Cross vs isolated margin modes
- Liquidation engine

Key concepts
- Margin subaccount per user
- Collateral valuation uses index/mark prices
- Maintenance margin ratio triggers liquidation

Data model (high-level)
- margin_account (user, mode)
- margin_loan (asset, principal, rate, opened_at)
- margin_interest_accrual (loan_id, amount, bucket)
- margin_risk_snapshot (user, collateral_value, debt_value, margin_ratio)
- liquidation_event (user, reason, positions closed, fees)

### B) Derivatives (Perps/Futures)
Core requirements
- Contract specs (symbol, lot size, settlement asset)
- Position engine (size, entry, unrealized PnL)
- Funding payments (perp)
- Mark price and index price
- Liquidation engine + insurance fund

Data model (high-level)
- der_contract
- der_order / der_execution
- der_position
- der_funding_rate / der_funding_payment
- der_liquidation
- insurance_fund_ledger_account (already fits ledger design)

### C) Options
Core requirements
- European-style settlement
- Expiry lifecycle: open → exercise/expire → settle

Notes
- Options are a separate surface; best shipped after perps are stable.

### D) Leveraged tokens
Core requirements
- Rebalancing rules
- Clear risk disclosure

Notes
- These are packaged derivatives and should be gated heavily.

---

## 4) Earn / Yield products (custodial)

Design rule: Earn is a **product catalog + position engine** over the same ledger.

### A) Simple Earn (flexible)
- User deposits asset into an earn pool
- Interest accrues continuously
- User can redeem at any time (subject to liquidity)

### B) Locked Earn
- Lockups with fixed APR
- Early redemption rules

### C) Lending / Loans
- Users lend assets to pools
- Borrowers are margin users (or institutional)

### D) Launchpool-style staking rewards
- Stake asset A to earn token B rewards over time

### E) Structured products (later)
- Dual investment, smart arbitrage
- Requires strict suitability/region gating

Data model (high-level)
- earn_product (kind, asset, rate model, lockup)
- earn_position (user, product_id, principal, status)
- earn_accrual_bucket (position_id, interest)

---

## 5) Token launch platforms

### Launchpad (IEO)
- Subscription windows
- Allocation rules
- Refunds + token distribution

### Task-based reward programs (Megadrop/Alpha)
- Eligibility tasks + staking
- Anti-sybil controls

Data model (high-level)
- launch_project
- launch_subscription
- launch_allocation
- task_program / task_completion

---

## 6) Payments, NFTs, Institutional (later modules)

These should be treated as separate programs, not mixed into the core trading rails until the platform is stable.

### Payments
- Binance Pay-like transfers: internal ledger transfers with compliance screening
- Card: external issuer integration; custodial balances are funding source
- Gift cards: code issuance + redemption with AML checks

### NFTs
- Marketplace requires on-chain custody decisions and chain indexing.
- Recommended: ship after Web3 domain is defined.

### Institutional
- Subaccounts
- Higher limits, custom reporting
- OTC RFQ workflow

---

## 7) Platform services (shared)

### Pricing & Oracles
- Spot index prices
- Mark price for derivatives
- FX reference rates

### Risk engine
- Limits enforcement
- Liquidation triggers
- Abuse controls (rate limits, cancel storms)

### Notifications
- Unified event taxonomy (orders, deposits, liquidations, margin calls)

### Support & explainability
- Every critical state has a stable reason code → human explanation.

---

## 8) Delivery plan (phased, but designed upfront)

Phase 1 — Core exchange (already aligned with repo)
- Convert UI + execute
- Spot markets/trade/orders
- Wallet deposits/withdrawals
- P2P escrow + disputes

Phase 2 — Automation
- Bots: UI + safe execution caps
- Copy trading: leader profiles + subscription + mirrored execution with strict limits

Phase 3 — Earn basics
- Simple Earn + Locked Earn (custodial)
- Earn positions in Wallet

Phase 4 — Margin
- Borrow/lend + isolated/cross
- Liquidation engine + insurance fund accounting

Phase 5 — Perpetual futures
- Contracts + positions + funding + liquidation

Phase 6+ — Options / Launch / Pay / Institutional / NFTs
- One module at a time, gated by region + KYC.
