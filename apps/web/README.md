# TradeSynapse Web App

Next.js (App Router) UI + API for the TradeSynapse spot exchange on BNB Smart Chain.

## Features

- **Real-time order book** — USDT-quoted markets with limit orders, partial fills, and maker/taker fees
- **Exchange wallet** — Deposits, withdrawals, and ledger with hold management
- **Portfolio dashboard** — Balances, PnL tracking, fill history
- **Copy trading** — Follow top traders, subscribe/pause/stop copying
- **Express router** — Net-first quote for fiat↔USDT (P2P) and fiat↔asset via USDT + best external spot estimate
- **Arbitrage scanner** — Cross-exchange price comparison with net-cost filtering
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

Open `http://localhost:3000`.

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
