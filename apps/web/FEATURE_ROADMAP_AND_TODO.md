# Product Roadmap + Architecture (Wallet + P2P + Uncertainty Modules)

This document is the implementation blueprint for adding a suite of “crypto dopamine modules” (instant / delayed / progression / crafting / social / AI) on top of the existing system, while keeping **Wallet** and **P2P** as the only core rails.

Goals
- Keep Wallet + P2P as the universal input/output rails.
- Make outcomes **auditable, explainable, and safe** (user-first).
- Ship many “game aisles” that feel different, but share the same engine and accounting.
- Preserve current visual language (see the P2P page patterns: cards, rails, dot headers, gradient accents, and CSS tokens in `src/app/globals.css`).

Non-negotiable invariants
1) One accounting layer
- All value movements happen through the existing ledger/holds patterns.
- Every module uses: **hold funds → resolve → settle → release/consume hold**.

2) One probabilistic engine
- A shared engine that produces outcomes from deterministic inputs.
- Supports multiple “volatility profiles” (Low/Medium/High) with **transparent labels**.

3) Verifiability / anti-tamper
- Every action that depends on randomness has: commit → reveal.
- Server commits to a hash of future randomness inputs before user confirms.

4) User-first economics
- Randomness should primarily affect **form/status/access/timing**, not whether a user “loses principal.”
- Any treasury edge should be an explicit, stable fee (and shown in the UI).

5) Operational safety
- Idempotent state transitions.
- Outbox-driven side effects.
- Strict rate limits, cooldowns, and opt-in variance.

---

## IA / Routing plan

We keep the app simple for users:
- Top-level: Wallet, P2P, (future) Arcade.
- “Arcade” is where all uncertainty modules live, but it is just a UI surface over the same wallet rails.

Proposed route layout (Next.js App Router)
- Public
  - `/` (marketing/landing)
  - `/p2p` (market browse can be public; taking actions requires auth)
  - `/login`, `/signup`, `/terms`, `/privacy`, `/support/*`
- Protected (requires session)
  - `/wallet`, `/wallet/withdraw`
  - `/p2p/orders`, `/p2p/orders/[id]` (placing/taking/settling orders)
  - `/arcade/*` (all dopamine modules)
  - `/notifications`, `/account` (settings)
- Role-protected
  - `/admin/*` (admin role)

Implementation note (recommended)
- Add an App Router route group: `src/app/(protected)/...` and a small server layout that verifies session cookie and redirects to `/login?next=...`.
- Keep API routes as the true enforcement boundary (already the pattern), but adding page-level protection improves UX.

---

## Header + Navbar (SiteChrome)

Keep the existing chrome style, but simplify navigation.

Header
- Left: brand logo (existing)
- Primary nav (desktop):
  - Wallet
  - P2P
  - Arcade (future)
- Right: Notifications bell, Theme toggle, Account avatar (existing)

Mobile drawer
- Sections:
  - “Core”: Wallet, P2P, Arcade
  - “Account”: Notifications, Account settings
  - “Support”: Help, Fees, API docs

Footer
- Keep Support links.
- Remove references to removed pages.

Theme rules
- Use only existing tokens: `var(--card)`, `var(--card-2)`, `var(--border)`, `var(--accent)`, `var(--accent-2)`, `var(--ring)`, `var(--up)`/`--down`/`--warn`.
- Reuse the P2P page patterns:
  - dot+rail section headers
  - bordered cards with subtle radial backgrounds
  - rounded-2xl/3xl surfaces + `shadow-[var(--shadow)]`

---

## System architecture (how everything fits together)

### A) Shared “Uncertainty Engine” (library)
Create a core library that every module calls.

Proposed library boundaries
- `src/lib/uncertainty/engine.ts`
  - `commit()` → returns a commitment (hash) bound to user + module + params
  - `reveal()` → resolves outcome deterministically from reveal inputs
- `src/lib/uncertainty/profiles.ts`
  - volatility profiles (Low/Medium/High)
  - all profiles disclose:
    - label
    - tail risk description
    - outcome table summary
- `src/lib/uncertainty/tables/*`
  - per-module outcome tables (versioned)
- `src/lib/uncertainty/audit.ts`
  - produces a user-facing “fairness proof” record

Randomness source model
- Use a server secret + user-provided nonce + action id + timestamp bucket.
- Commit/reveal ensures the server can’t bias after seeing user choice.
- Store all inputs needed to re-derive outcome (minus secrets) for audit.

### B) Module adapters (services)
Each module is an adapter that connects:
- input validation + fees
- holds (reserve funds)
- resolution timing
- settlement (ledger)
- outbox events
- notifications

Proposed structure
- `src/lib/arcade/modules/<moduleKey>/service.ts`
- `src/lib/arcade/modules/<moduleKey>/types.ts`
- `src/lib/arcade/modules/<moduleKey>/ui.ts` (shared UI copy + labels)

### C) Data model (DB)
Add minimal tables to support many modules consistently.

Core tables (proposed)
- `arcade_action`
  - `id`, `user_id`, `module`, `profile`, `input_json`, `commit_hash`, `reveal_json`, `status`
  - `requested_at`, `resolves_at`, `resolved_at`
- `arcade_outcome`
  - `action_id`, `outcome_code`, `outcome_json`, `rarity_tier`, `value_breakdown_json`
- `arcade_inventory`
  - user-owned perks/items/badges/keys

Do NOT create per-module bespoke tables unless required.

### D) Outbox + workers
Keep the current outbox pattern.

New outbox topics (examples)
- `arcade.action.committed`
- `arcade.action.resolved`
- `arcade.inventory.updated`
- `arcade.calendar.tick` (daily/weekly)

Workers
- Resolver worker for delayed actions (vault unlocks, multi-stage reveals).
- Analytics worker to update transparency dashboard aggregates.

---

## Transparency Dashboard (required)

A dedicated dashboard makes the system feel “legit” and reduces support load.

UI sections
- Volatility labels by module
- Outcome distributions (expected vs realized)
- Resolution latency stats
- Fees collected vs rewards granted (sustainability)
- Per-module incident counters (retries, failures)

Implementation
- Server-side aggregates (daily buckets) + client charts.
- Never show personally identifiable action details publicly.

---

# TODO list (implement all modules)

The TODOs are grouped to allow staged releases. Every module must implement:
- Input validation + user eligibility
- `commit → reveal` fairness proof
- Volatility label (Low/Med/High)
- Accounting: holds + settlement
- Rate limit + cooldown
- Audit log + analytics

## 0) Foundation (must ship first)
- [x] Add “Uncertainty Engine” primitives (`src/lib/uncertainty/hash.ts`) and per-module deterministic commit→reveal.
- [x] Create DB migrations for `arcade_action` + `arcade_inventory` (+ calendar/state/consumption/safety).
- [x] Add outbox topics + a resolver worker for delayed actions (resolve-ready cron + outbox worker).
- [x] Add a Transparency Dashboard (user + admin views).
- [x] Add a unified “Volatility Label” UX (Low/Med/High selectors and disclosures across modules).
- [x] Add module registry (plugin-like) so new modules register:
  - key, label, volatility profiles, input schema, outcome schema, UI copy.

## 1) Fast-feedback modules (instant dopamine)
### 1.1 Rarity Wheel (non-cash)
- [x] Spend points/fee → instant roll → grant cosmetic badge/title/frame.
- [x] Pity timer for cosmetics (disclosed).
- [x] Volatility modes change rarity tail; baseline always granted.

### 1.2 Boost Draft (pick 1 of 3)
- [x] User commits → system reveals 3 randomized boosts → user selects 1.
- [x] Boosts implemented (fee discount + P2P highlight).

### 1.3 Outcome Shards (random drops → deterministic crafting)
- [x] Each action drops shard types.
- [x] Crafting recipes convert shards into guaranteed rewards.

### 1.4 Flash Missions (instant reward for “healthy actions”)
- [x] Mission generator (daily rotation).
- [x] Completion yields randomized rewards.

### 1.5 Streak Protector (habit)
- [x] Weekly roll that can protect a daily streak once.

## 2) Delayed-resolution modules (retention)
### 2.1 Time-Locked Vault (deterministic base + randomized bonus)
- [x] Lock funds for 24h–7d.
- [x] Base yield deterministic; bonus randomized and bounded.
- [x] Scheduled resolver releases at `resolves_at`.

### 2.2 Multi-stage reveal
- [x] Stage 1 reveals hint tier; stage 2 final reveal.
- [x] Avoid “near miss” UI patterns.

### 2.3 Daily/weekly reward calendars
- [x] One claim per day.
- [x] Visible probability disclosure (per-module copy + transparency dashboard distributions).
- [x] Streak mechanics + disclosed reset rules.

## 3) Status & progression modules
### 3.1 Tier ascension
- [x] XP is deterministic; tiering and rewards tracked.
- [x] Tier benefits (cosmetics / progression inventory).

### 3.2 Prestige resets
- [x] Voluntary reset for long-term perks + unique cosmetics.

### 3.3 Badge drops (scarce cosmetics)
- [ ] Seasonal badge pools.
- [ ] Collection sets unlock access keys.

## 4) Creation & mutation modules (crafting)
### 4.1 Blind creation (mint → reveal)
- [x] Create item (points/fee) → reveal later.

### 4.2 Mutation engine (upgrade/degrade)
- [x] Upgrade non-cash attributes; failure yields fragments.
- [x] Optional insurance points (bounded behavior).

### 4.3 Fusion
- [x] Fusion (bounded upgrade chance) implemented.

## 5) Collective uncertainty modules (social variance)
### 5.1 Threshold events (community unlock)
- [x] If X participants this week, everyone receives a cosmetic.
- [x] Basic community status + claim flow.

### 5.2 Shared pools (bounded, non-lottery)
- [ ] Everyone gets baseline; some get boosted cosmetic/access.
- [ ] Participation via points (preferred) or clearly disclosed fee.

### 5.3 Rare global events calendar
- [x] Scheduled “season shifts” with public rules.

## 6) AI / knowledge dopamine modules (differentiator)
### 6.1 Probabilistic AI responses
- [ ] Same prompt can produce tiered outputs.
- [ ] “Rare” generations are collectible templates (not financial promises).

### 6.2 Blind insight packs
- [ ] Packs reveal analytics templates, education cards, or checklists.

## 7) Cross-module synergies
- [x] “Keys & Gates”: rare keys unlock entry into premium modules.
- [ ] Outcome-based unlocks: completing sets unlocks new volatility modes.

## 8) Safety, compliance, and anti-abuse
- [x] Rate-limit every module (per-user/day) via server-side safety limits.
- [x] Cooldowns / pacing enforced by module rules + daily claim limiter.
- [x] Optional self-exclusion + spend limits.
- [x] Audit log export for user.

---

## UI component checklist (reuse the theme)
- [x] `VolatilityPill` (Low/Med/High with tooltip) (implemented inline per-module)
- [x] `ProbabilityTable` (compact, disclosed) (via outcome tables + transparency distributions)
- [x] `FairnessProofCard` (commit hash, reveal inputs, outcome)
- [x] `ModuleCard` (P2P-style rail header + gradient accent)
- [x] `InventoryGrid` (badges/keys/boosts) (inventory endpoint + UI)

---

## Launch sequencing (recommended)
1) Foundation + calendar + cosmetics (low risk, high stickiness)
2) Boost Draft + shards crafting (agency)
3) Time-Locked Vault + multi-stage reveals (retention)
4) Progression + collections (identity)
5) Collective events + AI packs (novelty)

---

# Exchange + Pro Trading TODO (creative backlog)

## A) Pro order types + execution controls
- [x] Trailing stop (trail by %, activate at price, optionally place as stop-limit).
- [x] Post-only flag (reject if would cross; show user-facing reason).
- [x] Time-in-force: IOC and FOK.
- [x] Reduce-only flag (for future margin/positions; safe no-op for spot-only if not supported).
- [ ] Iceberg orders (display quantity + hidden remainder).
- [x] TWAP scheduler (split a large order into N slices over time).
- [ ] Take-profit ladder (split TP into multiple limit sells/buys).
- [x] One-click “close position” equivalent for spot (sell 100% base / buy with 100% quote).

## B) Risk limits + market safety
- [x] Per-user limits: max order notional, max open orders, and cancel rate limiting.
- [x] Market-level kill switch (halt new orders; allow cancels).
- [x] Price-band protection (reject orders too far from reference within a configurable band).
- [x] Self-trade prevention (STP modes: cancel newest/oldest/both).
- [x] Circuit breakers for extreme volatility (temporary halt + banner).
- [x] “Confirm high-risk action” UX for unusually large trades.

## C) Market quality + terminal depth
- [x] Order book depth heatmap + imbalance indicator.
- [x] Trades tape with filters (my trades, large trades) and copyable tx/order ids.
- [x] Spread/impact estimator for market orders (pre-trade).
- [x] Saved terminal workspaces (layout presets) and restore on reload.
- [x] Keyboard shortcuts (submit/cancel, toggle panels).

## D) Automation + reliability (cron/worker hardening)
- [x] Move conditional-order evaluation to a real worker/queue (idempotent jobs + retries).
- [x] Cron heartbeat endpoint + admin dashboard health widget (last run, last success, lag).
- [x] Dead-letter UI actions: re-drive job, mark resolved, export.
- [x] Idempotency keys for order placement API (dedupe on retries).

## E) Wallet + withdrawals (security + UX)
- [x] Withdrawal address book + labeling.
- [x] Withdrawal allowlist (approve addresses; cooldown before first use).
- [x] Per-user withdrawal limits + optional 2FA re-prompt for large amounts.
- [ ] Multi-RPC fallback lists per chain + health scoring.
- [ ] Auto-sweep thresholds and configurable sweep cadence.

## F) Notifications + retention
- [ ] Order lifecycle notifications: placed, partial fill, filled, canceled, rejected.
- [ ] Alert templates: crossing, % change, volatility spike, spread widening.
- [ ] Digest mode + quiet hours + per-channel preferences.

## G) Observability + support ops
- [ ] Structured logging redaction for secrets/keys.
- [ ] Trace/request id surfaced in UI and returned by API for support.
- [ ] Admin “account timeline export” (deposits/withdrawals/orders/ledger entries).
- [ ] Read-only admin impersonation (view-as) mode.

## H) Security & hygiene (do before production marketing)
- [ ] Rotate any secrets that have been exposed in local files, screenshots, logs, or chat history.
- [x] Add a preflight check that refuses to start in production with placeholder secrets.

