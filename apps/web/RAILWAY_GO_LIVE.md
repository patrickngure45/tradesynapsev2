# Railway go-live checklist (apps/web)

## 0) Stop-the-line security (do before real funds)

- Treat any secrets that appeared in local files, screenshots, logs, or chat as **compromised**.
- Rotate at minimum:
  - `CITADEL_MASTER_SEED` (deposit address derivation)
  - `DEPLOYER_PRIVATE_KEY` (hot wallet)
  - `PROOFPACK_SESSION_SECRET`
  - `PROOFPACK_SESSION_BOOTSTRAP_KEY`
  - `EXCHANGE_ADMIN_KEY`
  - `PROOFPACK_REVIEWER_KEY`
  - `EXCHANGE_CRON_SECRET` / `CRON_SECRET`
  - Any 3rd-party keys you actually use (Pinata/Binance/Groq/Google/etc)

## 1) Required Railway env vars (web service)

Hard requirements (app will refuse to boot in production if missing/unsafe):

- `DATABASE_URL`
- `NEXT_PUBLIC_BASE_URL` (must be public **https**, not localhost)
- `ALLOWED_ORIGIN` (your public origin, e.g. `https://coinwaka.com`; `ALLOWED_ORIGINS` also supported)
- `PROOFPACK_SESSION_SECRET` (>= 32 chars, random)
- `PROOFPACK_SESSION_BOOTSTRAP_KEY` (>= 16 chars, random)
- `EXCHANGE_ADMIN_KEY` (>= 16 chars, random)
- `EXCHANGE_CRON_SECRET` (>= 16 chars, random)
- Evidence storage:
  - Recommended: `EVIDENCE_STORAGE=s3` + the `EVIDENCE_S3_*` vars
  - Only if you accept ephemeral disk: `ALLOW_LOCAL_EVIDENCE_STORAGE_IN_PROD=1`

For `coinwaka.com` go-live, set:
- `NEXT_PUBLIC_BASE_URL=https://coinwaka.com`
- `ALLOWED_ORIGIN=https://coinwaka.com` (or include this value in `ALLOWED_ORIGINS`)

Strongly recommended:
- `NODE_OPTIONS=--max-old-space-size=768` (or higher if RAM allows)
- `DB_POOL_MAX=5` (per service)
- `BSC_RPC_URL` (paid/high-throughput for `eth_getLogs`)
- `BSC_RPC_URLS` (2+ fallbacks, comma/newline-separated)

## 2) Service layout on Railway (recommended)

Create separate Railway services from the same repo/Dockerfile:

- Web (HTTP + WS): default start (Docker CMD runs `scripts/entrypoint.sh`)
- Outbox worker (background): run `npm run outbox:worker`
- Deposit worker (background): run `npm run deposit:watch:bsc`

Each service should have its own `DB_POOL_MAX` to avoid connection storms.

## 3) Cron jobs to add (Railway cron or external)

Use `x-cron-secret: <EXCHANGE_CRON_SECRET>` header where possible (avoid putting secrets in URLs).

If you use cron-job.org (GET-only scheduler), these endpoints support GET:
- `/api/arcade/cron/resolve-ready`
- `/api/cron/notifications-digest`
- `/api/cron/price-alerts`
- `/api/exchange/cron/conditional-orders`
- `/api/exchange/cron/outbox-worker`
- `/api/exchange/cron/scan-deposits`
- `/api/exchange/cron/sweep-deposits`
- `/api/p2p/cron/expire-orders`

Important: do not include angle brackets in URL secrets (use `secret=actual_secret_value`, not `secret=<actual_secret_value>`).

Recommended network hardening for cron triggers:
- `EXCHANGE_CRON_ALLOWED_IPS` (comma-separated scheduler egress IPs)
- `CRON_ALLOWED_IPS` (fallback allowlist)
- For P2P cron specifically: `P2P_CRON_SECRET` and `P2P_CRON_ALLOWED_IPS`

- Deposit scan (every 2–3 minutes)
  - `GET /api/exchange/cron/scan-deposits?confirmations=2&native=1&tokens=1&symbols=USDT,USDC&max_ms=8000&max_blocks=40&blocks_per_batch=20`

  Notes:
  - You can optionally run a small finalize pass after scanning by setting `EXCHANGE_FINALIZE_AFTER_SCAN=1` (or passing `finalize=1`).

- Finalize pending deposits (every 1–2 minutes)
  - `GET /api/exchange/cron/finalize-deposits?max=250&max_ms=15000`

- P2P expire orders (every 1 minute)
  - `GET /api/p2p/cron/expire-orders?limit=50`

- Email notifications (optional; every 1–2 minutes)
  - `GET /api/cron/email-notifications?max=30&max_ms=20000`

- Ops alerts (recommended; every 2–5 minutes)
  - `GET /api/cron/ops-alerts`

- Sweep deposits (optional; every 10–15 minutes)
  - Enable only after scan/credit is stable.
  - `GET /api/exchange/cron/sweep-deposits?execute=1&tokens=0`

### 3.1) Cron auth env examples

```env
EXCHANGE_CRON_SECRET=replace-with-64-char-random
CRON_SECRET=replace-with-64-char-random
EXCHANGE_CRON_ALLOWED_IPS=203.0.113.10,203.0.113.11
CRON_ALLOWED_IPS=203.0.113.10,203.0.113.11

P2P_CRON_SECRET=replace-with-64-char-random
P2P_CRON_ALLOWED_IPS=198.51.100.20
```

Notes:
- If your scheduler has dynamic egress IPs, leave allowlist vars unset and rely on secret auth + proxy throttling.
- Rotate cron secrets after provider changes or suspected exposure.

## 4) Production toggles (safe defaults)

- Enable deposit scanning endpoint only when ready:
  - `EXCHANGE_ENABLE_DEPOSIT_SCAN=1`
- Enable sweeping only when ready:
  - `EXCHANGE_ENABLE_SWEEP_DEPOSITS=1`

## 4.1) Exchange abuse limits (recommended)

These are enabled with conservative defaults when unset, but you can tune them on Railway:

- `EXCHANGE_DEPOSIT_TRACE_MAX_PER_MIN`
- `EXCHANGE_DEPOSIT_REPORT_MAX_PER_MIN`
- `EXCHANGE_WITHDRAW_REQUEST_MAX_PER_MIN`
- `EXCHANGE_WITHDRAW_ALLOWLIST_MAX_PER_MIN`

Optional (disabled unless set):
- `EXCHANGE_PLACE_MAX_PER_MIN`

## 5) Verify go-live

- Open `/status` and confirm expected heartbeats are fresh.
- Do 5 test deposits (native + allowlisted tokens) and confirm UI credits within SLA.
- Run at least one end-to-end smoke script locally against production DB in read-only mode.

### Automated gates (recommended)

Before push/deploy:

```bash
npm run preflight:release
```

For strict mode (includes tests):

```bash
RELEASE_RUN_TESTS=1 npm run preflight:release
```

After deploy:

```bash
BASE_URL=https://coinwaka.com npm run smoke:postdeploy
```

Expected result: all checks pass, dev endpoints are blocked in prod, and unauthenticated cron calls are rejected.
