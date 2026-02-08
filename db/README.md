# Database (MVP)

This folder contains **stack-agnostic** Postgres migrations for the ProofPack MVP.

## Migrations
- `db/migrations/001_init.sql`: initial schema aligned to `research/derived/minimal_schema.md`
- `db/migrations/002_trade_fair_price.sql`: trade fair-price band + deviation columns
- `db/migrations/003_exchange_ledger.sql`: exchange ledger primitives (assets, accounts, journal, holds, deposit addresses)
- `db/migrations/004_exchange_withdrawals.sql`: withdrawal allowlist + withdrawal requests
- `db/migrations/005_exchange_holds_remaining.sql`: adds `remaining_amount` for partial hold consumption
- `db/migrations/006_exchange_orders.sql`: markets, limit orders, executions
- `db/migrations/007_exchange_fees.sql`: maker/taker fees (market bps + execution fee amounts)
- `db/migrations/012_outbox_and_signals.sql`: durable outbox events + generic AI-ready signals

## How to run locally
1) Create a Postgres database.
2) Apply migrations.

Option A — from the web app (recommended for this repo):
- From `apps/web`, run `npm run db:migrate` (uses `DATABASE_URL` from `apps/web/.env(.local)` or repo root `.env(.local)`).

Option B — using `psql` directly:

- `psql "$DATABASE_URL" -f db/migrations/001_init.sql`
- `psql "$DATABASE_URL" -f db/migrations/002_trade_fair_price.sql`

Notes:
- The migration enables `pgcrypto` for `gen_random_uuid()`.
- The schema intentionally avoids a table named `user` (reserved keyword) and uses `app_user`.
