# CoinWaka Master TODO (Source Of Truth)

Last updated: 2026-02-24

This file is the **single authoritative TODO** for completing CoinWaka end-to-end.
It unifies:
- BUILD_PLAN.md (what’s next)
- DEPOSITS_TODO.md (professional deposit reliability)
- FEATURE_ROADMAP_AND_TODO.md (Arcade / modules)

Principles
- Ship in **thin vertical slices** (UX + API + DB + ops) with a clear “done condition”.
- **API routes are the enforcement boundary**; page-level guards are UX.
- Prefer **idempotent state machines** + outbox-driven side effects.

## Locked product decisions (V1)

- Identity: **email + password** (phone optional, not required).
- Custody model: **custodial** (ledger/holds/outbox are the source of truth).
- V1 core: **Wallet + Trading + P2P + Earn + Ops/Admin**.
- AI stance: **explainability + support reduction + ops summaries** only.

## V1 Definition of Done (ship criteria)

- Users can: sign up → verify email → deposit (BSC) → trade/convert → withdraw → view history.
- P2P users can: add methods → post ad (SELL gated) → take ad → complete/cancel/dispute.
- Admin can: run ops jobs, see outbox health, review KYC, resolve disputes, audit trail.
- Deposits run for **24h without manual intervention** (no OOM, no overlap lockouts).
- Alerts: stale jobs/outbox backlog/dead letters notify reliably.

---

# 0) Production Readiness (do first)

- [ ] Secrets & env hygiene (ops action)
  - Rotate any exposed secrets/keys; ensure no real secrets committed
  - Add environment checklist for prod deploy
- [ ] Observability
  - Add error reporting (Sentry or equivalent)
  - Add request-id propagation + log correlation (API → DB → outbox)
- [ ] Auth UX hardening
  - Page-level guards for authenticated-only routes (middleware)
  - Consistent “unauthorized” UX (redirect + error banners)
- [ ] Rate limiting policy
  - Document & enforce per-endpoint rate limits (signup/login, P2P, withdrawals)
- [ ] Abuse & safety defaults
  - Tighten defaults for P2P (limits, cooldowns, eligibility)
  - Tighten withdrawal limits + allowlist + step-up auth

# 1) Wallet (User)

- [ ] Portfolio/Wallet UX completeness
  - Asset balances, available vs held, history timeline, fees shown
- [ ] Deposits UX
  - Deposit address page per asset/chain, status + confirmations
  - “Trace tx” user-facing read-only helper
- [ ] Withdrawals UX
  - Address allowlist (already exists) + clear UX, fees, ETA
  - Step-up UX (passkey) when required
  - Withdrawal status timeline + “why pending” explain

# 2) Trading / Convert

- [ ] Trade page readiness
  - Market selection, orderbook/depth, order forms w/ validation
  - Order cancellation, partial fills, history filters
- [ ] Convert readiness
  - Quote + execute + history; slippage bounds

# 3) P2P (Trust + Completion)

- [x] Marketplace + verified agent trust surfaces
- [x] My ads management (create/edit/pause)
- [x] Payment methods management (add/edit/delete)
- [ ] Seller tooling v1
  - “Ad details” view w/ performance + rules
  - Better error copy for common P2P posting failures
- [ ] Disputes v1
  - [x] Buyer/seller evidence upload + timeline
    - User: open dispute + attach image evidence in order chat
  - [ ] Admin dispute resolution UX polish

# 4) Deposits (Professional reliability)

Follow DEPOSITS_TODO.md verbatim; this section is the “roll-up”.

- [ ] Decide production deposit scope (chain/assets/confirms/SLA)
- [ ] Split scanner into worker service (recommended)
- [ ] Paid RPC provider for BSC (required for reliability)
- [ ] Scanner correctness proof (idempotent credits)
- [ ] Sweep only after scan is boring (caps + isolation)

# 5) Admin & Ops

- [ ] Admin UX completeness
  - Audit log filters + export
  - User admin: disable user, view balances/holds, forced logout
- [ ] Automation console completeness
  - One-click run-now for all jobs + lock status
  - Dead letter triage playbooks

# 6) Compliance & Trust (V1 baseline)

- [ ] Public docs pages
  - Terms, Privacy, Fees, Support, Risk disclosures
- [ ] KYC policy UX
  - Clear gating copy (SELL P2P, withdrawals)
  - Admin review queue UX

# 7) QA & Hardening

- [ ] Tests for critical state machines
  - Deposits idempotency, withdrawals, P2P order transitions
- [ ] Security checks
  - CSRF coverage for browser mutations
    - v2 Wallet + v2 Account mutations include `x-csrf-token`
  - Session hardening, step-up enforcement for sensitive actions
- [ ] Load/soak tests
  - Outbox backlog behavior, scan job stability

# 8) Optional (Post-V1)

- [ ] Arcade modules expansion (see FEATURE_ROADMAP_AND_TODO.md)
- [ ] Multi-chain deposits
- [ ] Fiat ramps integrations

---

## “Start here” (next 5 concrete tasks)

1) Add middleware page guards for authenticated-only pages
2) Add Sentry (or equivalent) + basic request-id correlation
3) Deposit scanner: lock TTL + hard caps + paid RPC readiness
4) (Done) Withdrawal step-up (2FA/passkey) + allowlist UX polish
5) P2P disputes UX polish + evidence upload
