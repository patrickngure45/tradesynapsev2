# TradeSynapse Web App

Next.js (App Router) UI + API for Wallet rails and P2P escrow settlement on BNB Smart Chain.

## Features

- **Wallet** — Deposits, withdrawals, and ledger with hold management
- **P2P** — Escrow settlement, local payment rails, disputes, and reputation
- **Admin dashboard** — Withdrawal review, KYC management, reconciliation, audit log
- **Session auth** — HMAC-SHA256 signed session cookie, TOTP 2FA, email verification
- **Notifications** — In-app alerts for orders, withdrawals, KYC, and system events

## Prereqs

- Node.js 20+ (Node 22 is fine)
- A Postgres database (Neon, local Postgres, etc.)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

Copy `.env.example` to `.env.local` and fill in required values:

```bash
cp .env.example .env.local
```

Key variables:
- `DATABASE_URL` — Postgres connection string
- `PROOFPACK_SESSION_SECRET` — 32+ char secret for session signing
- `NEXT_PUBLIC_BASE_URL` — Public URL (default `http://localhost:3000`)

Exchange safety (optional; defaults to OFF unless set):
- `EXCHANGE_MAX_OPEN_ORDERS_PER_USER` — max open orders per user
- `EXCHANGE_MAX_ORDER_NOTIONAL` — max notional per order (price × quantity)
- `EXCHANGE_PRICE_BAND_BPS` — rejects limit orders too far from reference price
- `EXCHANGE_CANCEL_MAX_PER_MIN` — per-user cancel rate limit

Exchange abuse limits (enabled with defaults when unset):
- `EXCHANGE_DEPOSIT_TRACE_MAX_PER_MIN` — per-user deposit trace requests per minute
- `EXCHANGE_DEPOSIT_REPORT_MAX_PER_MIN` — per-user deposit report requests per minute
- `EXCHANGE_WITHDRAW_REQUEST_MAX_PER_MIN` — per-user withdrawal requests per minute
- `EXCHANGE_WITHDRAW_ALLOWLIST_MAX_PER_MIN` — per-user allowlist writes per minute

Rate-limit policy docs:
- `RATE_LIMIT_POLICY.md` — global proxy tiers + route-level override model
- `RATE_LIMIT_AUDIT_2026-02-25.md` — mutating endpoint coverage snapshot and priority gaps

Optional (disabled unless set):
- `EXCHANGE_PLACE_MAX_PER_MIN` — per-user order placement requests per minute

Gas (BSC):
- Gas fees are modeled and paid in `BNB`.

Optional (production):
- `EXCHANGE_RELAY_URL` — Base URL of the exchange relay service (e.g. `https://your-relay.up.railway.app`)
- `EXCHANGE_RELAY_KEY` — Shared secret sent as `x-relay-key` to protect the relay

3. Run migrations:

```bash
npm run db:migrate
```

4. Start the dev server:

```bash
npm run dev:server
```

`dev:server` runs the repo's custom server (`server.ts`) which keeps HTTP + `/ws` on the same port and is the most reliable way to run local `/api/*` routes in this codebase.

Or start Next's built-in dev server + the deposit watcher together:

```bash
npm run dev:all
```

If you prefer the custom server + deposit watcher, run these in two terminals instead:

```bash
npm run dev:server
```

```bash
npm run deposit:watch:bsc
```

Open `http://localhost:3000`.

## Railway production checklist (important)

If you see deploy logs like `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`, the web container is running out of RAM and will restart mid-request.

**Service sizing**
- Give the **web** service at least **1GB RAM** (512MB is often too small for Next.js + data-heavy endpoints).
- Keep **replicas low** until stable (start with 1).

**Node runtime**
- Set `NODE_ENV=production` (already used by `npm run start:prod`).
- If you increased RAM, set `NODE_OPTIONS=--max-old-space-size=768` (or higher if your container has more memory).

**Database pool (per Railway service)**
- Set `DB_POOL_MAX` to a conservative value per service to avoid connection storms.
	- Example: `DB_POOL_MAX=5` for the web service.
	- If you run separate worker services, give each its own `DB_POOL_MAX` too.

**Workers (recommended layout)**
The web service only runs migrations + serves HTTP/WebSocket traffic. For production deposits/outbox you should run these as separate Railway services:
- `npm run outbox:worker`
- `npm run deposit:watch:bsc` (or `deposit:watch:eth`)

Deposit worker scope + reliability docs:
- `DEPOSITS_SCOPE.md`
- `DEPOSITS_TODO.md`
- `BSC_RPC_PLAN.md`

**Deposit worker (BSC) recommended env (baseline)**
- `DEPOSIT_CONFIRMATIONS=2`
- `DEPOSIT_SCAN_NATIVE=1`
- `DEPOSIT_SCAN_TOKENS=1`
- `DEPOSIT_SCAN_SYMBOLS=USDT,USDC`
- `DEPOSIT_SCAN_POLL_MS=120000`
- `DEPOSIT_SCAN_MAX_MS=20000`
- `DEPOSIT_SCAN_MAX_BLOCKS=120`
- `DEPOSIT_SCAN_BLOCKS_PER_BATCH=60`
- `EXCHANGE_SCAN_LOCK_TTL_MS=120000`
- `BSC_RPC_URL=<paid endpoint>`
- Optional failover: `BSC_RPC_URLS=<url1,url2>`

Sweeps should run as a scheduled job (or a separate service invoked on a timer):
- `npm run sweep:deposits`

## Release safety gates (real-user funds)

Run these before pushing to production:

```bash
npm run preflight:release
```

What it checks:
- required high-risk env vars are set (`DATABASE_URL`, session secret, wallet seed/key)
- production URL and safety flags (`NEXT_PUBLIC_BASE_URL`, `RUN_SEED_PROD`, `NEXT_PUBLIC_USE_MAINNET`)
- cron secret and optional allowlist presence
- `lint` + `build` gates

Optional stricter gate (includes tests):

```bash
RELEASE_RUN_TESTS=1 npm run preflight:release
```

After deploy, run smoke checks against live:

```bash
BASE_URL=https://coinwaka.com npm run smoke:postdeploy
```

Smoke checks verify:
- `/api/system/version` is healthy and running in production mode
- `/api/status` responds with valid health payload
- dev endpoints are blocked in production
- cron endpoints reject unauthenticated requests

## Exchange rollout checklist (production)

If you’re enabling the pro trading / conditional orders stack in production, do this in order:

1) Apply DB migrations (includes trailing stop + order idempotency support)
	- Run `npm run db:migrate` against your production `DATABASE_URL`.
	- Ensure migrations `061_exchange_conditional_orders_trailing_stop.sql` and `062_app_idempotency_keys.sql` are applied.

2) Set / rotate secrets
	- Set `EXCHANGE_CRON_SECRET` (or `CRON_SECRET`) and rotate it before mainnet / real funds.

3) Enable conditional orders + schedule cron
	- Set `EXCHANGE_ENABLE_CONDITIONAL_ORDERS=1`.
	- Schedule: `POST /api/exchange/cron/conditional-orders?secret=...&limit=50` (or `GET` for simple cron providers).
	- Recommended cadence: every **2–5s** for a fast terminal, or **10–15s** to reduce load.

4) (Optional) Turn on safety limits (start conservative)
	- `EXCHANGE_MAX_OPEN_ORDERS_PER_USER=50`
	- `EXCHANGE_MAX_ORDER_NOTIONAL=10000`
	- `EXCHANGE_PRICE_BAND_BPS=250`
	- `EXCHANGE_CANCEL_MAX_PER_MIN=30`

5) Verify in admin
	- Open the admin dashboard and confirm a recent heartbeat for `exchange:conditional-orders`.
	- If the heartbeat is stale, confirm the scheduler is running and the `secret` matches.

## Cron jobs (cron-job.org / Railway)

This app exposes several production cron endpoints that are safe to run from a scheduler.

For the systematic, production-grade checklist (scope, architecture, paid services, and acceptance criteria), follow:

- `DEPOSITS_TODO.md`

### Cron auth + IP allowlist (recommended)

Cron endpoints are protected by shared-secret auth in production and now support optional source IP allowlists.

Set these env vars in Railway:

- `EXCHANGE_CRON_SECRET=<long-random-secret>`
- `CRON_SECRET=<same-secret-or-fallback>`
- `EXCHANGE_CRON_ALLOWED_IPS=<comma-separated scheduler egress IPs>`
- `CRON_ALLOWED_IPS=<fallback allowlist>`

For P2P cron routes, you can use dedicated values:

- `P2P_CRON_SECRET=<long-random-secret>`
- `P2P_CRON_ALLOWED_IPS=<comma-separated scheduler egress IPs>`

Example:

```env
EXCHANGE_CRON_SECRET=replace-with-64-char-random
CRON_SECRET=replace-with-64-char-random
EXCHANGE_CRON_ALLOWED_IPS=203.0.113.10,203.0.113.11
CRON_ALLOWED_IPS=203.0.113.10,203.0.113.11

P2P_CRON_SECRET=replace-with-64-char-random
P2P_CRON_ALLOWED_IPS=198.51.100.20
```

Notes:
- Allowlist is optional; when set, only requests from listed IPs pass auth.
- If your scheduler has dynamic egress IPs, leave allowlist unset and rely on secret + proxy throttling.
- Rotate cron secrets after incidents or provider changes.

### Required (Arcade delayed actions)

Some Arcade modules create `scheduled` actions that must be moved to `ready` on a timer.
Run this every **1–2 minutes**:

- `GET /api/arcade/cron/resolve-ready?secret=...`

### Recommended (exchange ops)

These are the common operational jobs:

- Outbox worker (every **1 minute**)
	- `GET /api/exchange/cron/outbox-worker?secret=...&max_ms=8000&batch=25&max_batches=2`

- Email outbox sender (every **1–2 minutes**)
	- Sends notification emails queued in `ex_email_outbox`.
	- `GET /api/cron/email-notifications?secret=...&max=30&max_ms=20000`

	Notes:
	- Requires email transport config (`RESEND_API_KEY` or SMTP vars) and verified user emails.
	- Writes heartbeat `cron:email-notifications` (visible on `/status` + admin status).

- Ops alerts (every **1–2 minutes**)
	- Detects degraded operational signals and emails a summary (deduped + rate-limited).
	- `GET /api/cron/ops-alerts?secret=...`

	Required env:
	- `OPS_ALERT_EMAIL_TO` — comma-separated recipient list
	- Email transport config (same as email notifications; e.g. `RESEND_API_KEY` or SMTP vars)

	Tuning (optional):
	- `OPS_ALERT_MIN_INTERVAL_MINUTES` (default `30`) — minimum interval between sends for the same degradation state
	- `OPS_OUTBOX_DEAD_THRESHOLD` (default `1`) — alert if outbox dead letters exceed threshold
	- `OPS_OUTBOX_OPEN_THRESHOLD` (default `5000`) — alert if outbox open backlog exceeds threshold
	- `OPS_EMAIL_OUTBOX_PENDING_THRESHOLD` (default `200`) — alert if `ex_email_outbox` pending exceeds threshold
	- `OPS_EMAIL_OUTBOX_AGE_MINUTES` (default `20`) — alert if oldest pending email is older than this
	- `OPS_JOB_LOCK_STALE_AFTER_MINUTES` (default `10`) — alert if a job lock is held and not updated for this long

	Expected-service checks (optional; alert if heartbeat is missing/stale):
	- `EXPECT_OUTBOX_WORKER=1`
	- `EXPECT_DEPOSIT_SCAN=1`
	- `EXPECT_SWEEP_DEPOSITS=1`

- Deposit scan (native + allowlisted token logs) (every **2–3 minutes**)
	- Recommended (BSC):
		- `GET /api/exchange/cron/scan-deposits?secret=...&confirmations=2&native=1&tokens=1&symbols=USDT%2CUSDC&max_ms=8000&max_blocks=40&blocks_per_batch=20`

	Notes:
	- Optionally, scan-deposits can run a small finalize pass right after scanning by setting `EXCHANGE_FINALIZE_AFTER_SCAN=1` (or passing `finalize=1`).
	- The finalize pass is capped/time-budgeted so the scan call stays within typical cron HTTP timeouts.

- Finalize pending deposits (credits any pending events that are now confirmed) (every **1–2 minutes**)
	- `GET /api/exchange/cron/finalize-deposits?secret=...&max=250&max_ms=15000`

	Notes:
	- This is a lightweight “catch-up” job that helps ensure pending-native deposits are credited promptly.
	- It is idempotent (won’t double-credit) and uses a distributed DB lock.

	Notes:
	- In production, token scanning requires an allowlist via `symbols=...` unless `ALLOW_TOKEN_SCAN_ALL=1` is set.
	- To avoid long-lived `429 scan_in_progress` after restarts, set `EXCHANGE_SCAN_LOCK_TTL_MS=120000` in production.

- Sweep deposits (optional housekeeping; NOT required for deposits to reflect)
	- Keep this disabled until scan/credit is stable.
	- When enabling, start with native-only:
		- `GET /api/exchange/cron/sweep-deposits?secret=...&execute=1&tokens=0`
	- Or allowlisted tokens:
		- `GET /api/exchange/cron/sweep-deposits?secret=...&execute=1&tokens=1&symbols=USDT%2CUSDC%2CWBNB`

- Conditional orders (Stop‑Limit, OCO, Trailing Stop) trigger (every **2–5 seconds** for a fast UI, or every **10–15 seconds** to reduce load)
	- Disabled by default in production; enable with `EXCHANGE_ENABLE_CONDITIONAL_ORDERS=1`
	- `GET /api/exchange/cron/conditional-orders?secret=...&limit=50` (or `POST`)

	Notes:
	- The cron handler writes a service heartbeat (`exchange:conditional-orders`) visible in the admin dashboard system status.
	- `POST /api/exchange/orders` supports idempotent retries via `x-idempotency-key` (or `idempotency_key` in JSON body).

**Avoid overlap**: `scan-deposits` uses a distributed DB lock. If two scans overlap, one returns `429 scan_in_progress`.
Run the scan job every 2–3 minutes (not every minute) and keep `EXCHANGE_SCAN_LOCK_TTL_MS` short.

### Recommended (P2P ops)

Expire stale P2P orders and send “expiring soon” reminders (every **1 minute**):

- `GET /api/p2p/cron/expire-orders?secret=...&limit=50`

Notes:
- Uses `P2P_CRON_SECRET` if set; otherwise accepts the shared `EXCHANGE_CRON_SECRET` / `CRON_SECRET`.

#### Verified agents (M-Pesa)

To create (or update) a **verified-agent** M-Pesa payment method for a dedicated agent user, use:

```bash
npm run p2p:add-verified-agent -- \
	--email agent1@example.com \
	--name "Agent One" \
	--phone "+2547xxxxxxx" \
	--network Safaricom
```

Notes:
- If `--password` is omitted, the password defaults to the **local-part** of the email (e.g. `agent1`).
- The script sets `email_verified=true`, `kyc_level=full`, and stores `verifiedAgent=true` in `p2p_payment_method.details`.

### Optional (price alerts)

## Smoke tests (exchange)

Recommended single command (starts dev server + auto dev-login when available):

- `npm run smoke:exchange:dev`

Non-dev smoke scripts (example: `npm run smoke:exchange-orders`) intentionally require auth via `COOKIE=...` / `PP_SESSION+CSRF` and will fail with `No auth configured` if you run them without a running server + credentials.

If you’re using price alerts (`app_price_alert`) and want notifications to trigger automatically:

- Enable with `EXCHANGE_ENABLE_PRICE_ALERTS=1`
- Run every **1–5 minutes**:
	- `GET /api/cron/price-alerts?secret=...&max=200`

### Optional (notifications digest / quiet hours)

If users enable quiet hours + digest in Account settings, notifications created during quiet hours are deferred and then flushed into a single “Digest” notification per user.

- Enable admin health expectation with `EXCHANGE_ENABLE_NOTIFICATIONS_DIGEST=1`
- Run every **5–10 minutes**:
	- `GET /api/cron/notifications-digest?secret=...`

Notes:
- The cron only flushes users who are currently **outside** their quiet hours.
- The admin dashboard also includes a manual “Run digest now” button and deferred-queue inspector for verification/support.

### Security note

The `secret=...` value is a bearer credential. Rotate it before any real funds / mainnet usage.

## Ops alerts (production)

This app can send **operational alert emails** when health signals go degraded (stale expected services, outbox backlog/dead letters, email-outbox backlog).

1) Set env vars in production (Railway):
	- `OPS_ALERT_EMAIL_TO=ops@coinwaka.com` (comma-separated list supported)
	- `NEXT_PUBLIC_BASE_URL=https://coinwaka.com` (so alert emails link to your live `/status`)

Optional tuning:
	- `OPS_ALERT_MIN_INTERVAL_MINUTES=30`
	- `OPS_OUTBOX_DEAD_THRESHOLD=1`
	- `OPS_OUTBOX_OPEN_THRESHOLD=5000`
	- `OPS_EMAIL_OUTBOX_PENDING_THRESHOLD=200`
	- `OPS_EMAIL_OUTBOX_AGE_MINUTES=20`

2) Add a cron-job.org entry (every **2–5 minutes**):
	- `GET /api/cron/ops-alerts?secret=...`

Notes:
	- Uses DB dedupe to avoid spamming the same alert repeatedly.
	- If your scheduler supports headers, prefer `x-cron-secret` over putting the secret in the URL.

## Smoke testing (Arcade)

Run a quick end-to-end verification of the Arcade endpoints:

```bash
npm run smoke:arcade
```

For production, run it against your deployed host (e.g. Coinwaka) with a real session cookie (must include `__csrf`):

```bash
BASE=https://your-app.up.railway.app COOKIE='...; __csrf=...; ...' npm run smoke:arcade
```

Alternative auth (sometimes easier to paste):

```bash
BASE=https://coinwaka.com PP_SESSION='...' CSRF='...' npm run smoke:arcade
```

### Seeding a dedicated test user (recommended)

To fully exercise shard-costing modules (insight packs, creation, mutation, fusion) in a fresh test account, you can seed Arcade inventory directly via helper scripts.

Find user id by email:

```bash
EMAIL=you@example.com npm run user:find
```

Grant shards:

```bash
USER_ID=<uuid> SHARDS=500 npm run arcade:grant-shards -- --apply
```

Grant a cosmetic (use two distinct cosmetics to enable fusion smoke):

```bash
USER_ID=<uuid> KIND=cosmetic CODE=test_cosmetic_a RARITY=common QTY=1 npm run arcade:grant-item -- --apply
USER_ID=<uuid> KIND=cosmetic CODE=test_cosmetic_b RARITY=common QTY=1 npm run arcade:grant-item -- --apply
```

## Deposits (permanent address) + fast settlement

- Each user has **one permanent deposit address per chain** (e.g. BSC).
- The wallet UI auto-fetches it via `POST /api/exchange/deposit/address`.
- Deposits are credited by the **deposit scan worker**, which watches on-chain transfers and posts ledger credits.

Run the worker locally (fast settlement):

```bash
# BSC (recommended for local demos)
DEPOSIT_CONFIRMATIONS=1 DEPOSIT_SCAN_POLL_MS=5000 npm run deposit:watch:bsc

# ETH (slower, more confirmations)
DEPOSIT_CONFIRMATIONS=3 DEPOSIT_SCAN_POLL_MS=15000 npm run deposit:watch:eth
```

Key env vars:
- `BSC_RPC_URL` / `ETH_RPC_URL` — set these for reliability and speed.
- `DEPOSIT_CONFIRMATIONS` — lower = faster crediting (tradeoff: reorg risk).
- `DEPOSIT_PENDING_CREDIT` — if set (`1`/`true`), credits immediately but locks funds with a hold until confirmations (requires migration `044_deposit_pending_hold.sql`).
- `DEPOSIT_REORG_WINDOW_BLOCKS` — how far back the worker verifies recorded deposit logs still exist on-chain (default `24`). If a log disappears (reorg), it marks the event `reverted`, releases any pending hold, and posts a compensating ledger entry.
- `DEPOSIT_SCAN_POLL_MS` — how often the worker scans for new deposits.

Quick readiness check (schema + trigger):

```bash
npm run check:deposit-worker
```

## Sweeping deposit addresses (ops)

Deposit addresses can accumulate dust/native gas and sweepable tokens. The sweeper consolidates funds back to the hot wallet.

```bash
# plan-only (prints actions, does not send tx)
npx tsx scripts/sweep-deposits.ts

# execute on-chain
SWEEP_EXECUTE=true npx tsx scripts/sweep-deposits.ts
```

Optional env vars:
- `SWEEP_MIN_BNB` — minimum native balance to consider sweeping (default `0.0001`).
- `SWEEP_MIN_TOKEN` — default minimum token balance to consider sweeping (default `0.001`).
- `SWEEP_MIN_<SYMBOL>` — per-token override (e.g. `SWEEP_MIN_USDT=1`).
- `SWEEP_ACCOUNT_GAS_LEDGER` — if `true`, records actual on-chain gas spend (from tx receipts) into the exchange ledger as a `gas_spend` journal entry (system treasury → burn/sink) for accounting.

## Withdrawals (security + tier policy)

Withdrawal requests are gated server-side in `POST /api/exchange/withdrawals/request`:

- Email must be verified.
- Strong auth is required: Passkey step-up (WebAuthn) OR 2FA (TOTP).
- Non-`full` KYC withdrawals are limited to a configurable list of “stable” asset symbols with per-tier caps.

Passkeys (WebAuthn) configuration:

- `WEBAUTHN_ORIGIN` (default: `NEXT_PUBLIC_BASE_URL` origin) — expected origin for WebAuthn verification.
- `WEBAUTHN_RP_ID` (default: derived from origin hostname) — RP ID.
- `WEBAUTHN_RP_NAME` (default: `Coinwaka`) — display name shown during passkey creation.

Environment variables:

- `WITHDRAWAL_NO_KYC_ALLOWED_ASSETS` (default `USDT`) — comma-separated symbols allowed for `kyc_level=none`.
- `WITHDRAWAL_BASIC_ALLOWED_ASSETS` (default `USDT,USDC,BUSD`) — comma-separated symbols allowed for `kyc_level=basic`.
- `WITHDRAWAL_NO_KYC_MAX_SINGLE` (default `50`) — max single withdrawal amount for `none` (per asset units).
- `WITHDRAWAL_NO_KYC_MAX_24H` (default `100`) — max total requested withdrawals in 24h for `none` (per asset units).
- `WITHDRAWAL_BASIC_MAX_SINGLE` (default `2000`) — max single withdrawal amount for `basic` (per asset units).
- `WITHDRAWAL_BASIC_MAX_24H` (default `5000`) — max total requested withdrawals in 24h for `basic` (per asset units).
- `WITHDRAWAL_ALLOWLIST_MIN_AGE_HOURS` (default `0`) — optional cooldown for newly-added withdrawal addresses.

Velocity (global, counts/amount across all assets) is controlled separately in `WITHDRAWAL_MAX_COUNT_1H`, `WITHDRAWAL_MAX_COUNT_24H`, and `WITHDRAWAL_MAX_AMOUNT_24H`.

## P2P market seeding

Seed realistic USDT P2P depth (both SELL and BUY ads):

```bash
npm run p2p:seed
```

Light or dense one-shot presets:

```bash
npm run p2p:seed:light
npm run p2p:seed:dense
```

Run continuous bot refresh loop:

```bash
npm run p2p:mm
```

Run fast refresh mode (useful for local demos):

```bash
npm run p2p:mm:fast
```

Run ultra-fast mode (stress/demo):

```bash
npm run p2p:mm:ultra
```

Run stable low-churn mode (production-like):

```bash
npm run p2p:mm:stable
```

Optional tuning:
- `P2P_MM_INTERVAL_MS` (default `45000`)
- `P2P_MM_ADS_PER_SIDE` (default `2`)
- `P2P_SEED_ADS_PER_SIDE` (default `2`)
- `P2P_SEED_CLOSE_EXISTING` (`1` to replace old bot ads, `0` to append)

## P2P abuse-protection tuning

Order creation includes server-side anti-abuse guards (rate limit + caps + timeout cooldown).

- `P2P_MAX_OPEN_CREATED_ORDERS` (default `3`) — max open orders in `created` (awaiting payment) per buyer.
- `P2P_TIMEOUT_WINDOW_HOURS` (default `24`) — lookback window for timeout/cooldown logic.
- `P2P_TIMEOUT_MIN_COUNT` (default `5`) — minimum timeouts in window before cooldown can apply.
- `P2P_TIMEOUT_RATIO_THRESHOLD` (default `0.6`) — timeout ratio threshold (timeouts / total created) to trigger cooldown.
- `P2P_TIMEOUT_COOLDOWN_MINUTES` (default `60`) — how long the buyer is blocked after the most recent timeout.

P2P order reminders:
- `P2P_EXPIRY_WARNING_MINUTES` (default `5`) — send a one-time "payment window ending soon" notification when an order is close to expiring.

## Demo

See `project/DEMO_CHECKLIST.md` for a guided walkthrough.

## Smoke tests

```bash
npm run smoke:all
```

Exchange-specific smoke tests (useful for go-live QA):

```bash
npm run smoke:exchange-core

# or auto-start the dev server:
npm run smoke:exchange-core:dev

# individual:
npm run smoke:exchange-marketdata-stream
npm run smoke:exchange-ledger
npm run smoke:exchange-orders
npm run smoke:exchange-withdrawals
```

Dev helpers (auto-starts the dev server in the smoke script):

```bash
npm run smoke:exchange-orders:dev
npm run smoke:exchange-withdrawals:dev
```

Individual smoke scripts are in `scripts/smoke-*.ts`.

## Tests

```bash
npx vitest run
```

## Project structure

```
src/app/           → Pages and API routes (App Router)
src/components/    → Shared components (SiteChrome, ThemeProvider, etc.)
src/lib/           → Server utilities (DB, auth, sessions, rate limiting)
db/migrations/     → SQL migration files (applied in order)
scripts/           → Dev/smoke scripts
public/            → Static assets
```

## Environment

See `.env.example` for all available variables with descriptions.
