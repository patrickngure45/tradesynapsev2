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
npm run dev
```

Or start the dev server + the deposit watcher together:

```bash
npm run dev:all
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

Sweeps should run as a scheduled job (or a separate service invoked on a timer):
- `npm run sweep:deposits`

## Cron jobs (cron-job.org / Railway)

This app exposes several production cron endpoints that are safe to run from a scheduler.

For the systematic, production-grade checklist (scope, architecture, paid services, and acceptance criteria), follow:

- `DEPOSITS_TODO.md`

### Required (Arcade delayed actions)

Some Arcade modules create `scheduled` actions that must be moved to `ready` on a timer.
Run this every **1–2 minutes**:

- `GET /api/arcade/cron/resolve-ready?secret=...`

### Recommended (exchange ops)

These are the common operational jobs:

- Outbox worker (every **1 minute**)
	- `GET /api/exchange/cron/outbox-worker?secret=...&max_ms=20000&batch=50&max_batches=10`

- Deposit scan (native + allowlisted token logs) (every **2–3 minutes**)
	- Recommended (BSC):
		- `GET /api/exchange/cron/scan-deposits?secret=...&confirmations=2&native=1&tokens=1&symbols=USDT%2CUSDC&max_ms=20000&max_blocks=120&blocks_per_batch=60`

	Notes:
	- In production, token scanning requires an allowlist via `symbols=...` unless `ALLOW_TOKEN_SCAN_ALL=1` is set.
	- To avoid long-lived `429 scan_in_progress` after restarts, set `EXCHANGE_SCAN_LOCK_TTL_MS=120000` in production.

- Sweep deposits (optional housekeeping; NOT required for deposits to reflect)
	- Keep this disabled until scan/credit is stable.
	- When enabling, start with native-only:
		- `GET /api/exchange/cron/sweep-deposits?secret=...&execute=1&tokens=0`
	- Or allowlisted tokens:
		- `GET /api/exchange/cron/sweep-deposits?secret=...&execute=1&tokens=1&symbols=USDT%2CUSDC%2CWBNB`

**Avoid overlap**: `scan-deposits` uses a distributed DB lock. If two scans overlap, one returns `429 scan_in_progress`.
Run the scan job every 2–3 minutes (not every minute) and keep `EXCHANGE_SCAN_LOCK_TTL_MS` short.

### Security note

The `secret=...` value is a bearer credential. Rotate it before any real funds / mainnet usage.

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
