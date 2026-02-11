# TradeSynapse Web App

Next.js (App Router) UI + API for the TradeSynapse spot exchange on BNB Smart Chain.

## Features

- **Real-time order book** — TST/USDT market with limit orders, partial fills, and maker/taker fees
- **Exchange wallet** — Deposits, withdrawals, and ledger with hold management
- **Portfolio dashboard** — Balances, PnL tracking, fill history
- **Copy trading** — Follow top traders, subscribe/pause/stop copying
- **Arbitrage scanner** — Cross-exchange price comparison with auto-scan
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
