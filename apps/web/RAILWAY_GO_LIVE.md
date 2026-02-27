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

## 0.5) Initial Railway project setup

Before pushing to production you should configure Railway with the repository.

1. **Install the Railway CLI** (`npm install -g railway`) or use the web UI.
2. Log in and run `railway init` in the repo root. Choose an existing project or create a new one named `tradesynapsev2`.
3. When prompted, set the **root directory** to `/` and the **branch** to `main` (or your deployment branch).
4. Add a service for the web app using the Dockerfile at `apps/web/Dockerfile`. Name it `web`.
   - In the Railway dashboard you can also add the service via **New Service → Deploy from GitHub → Dockerfile**.
   - Set the **Start Command** to `npm run start` (which runs migrations then `start:prod`).
5. Create two additional services using the same repo/Dockerfile:
   - **outbox-worker** with start command `npm run outbox:worker`.
   - **deposit-worker** with start command `npm run deposit:watch:bsc` (or `deposit:watch:eth` if you use Ethereum).
6. (Optional) Use `railway link` or the dashboard to enable **private networking** between services and the Postgres plugin.
7. Create a `railway.json` (see example below) in the repo to track variable names and service definitions. Commit it to source control so teammates can replicate the setup.

```json
{
  "projectId": "<your-project-id>",
  "services": [
    {
      "name": "web",
      "plugin": "docker",
      "build": { "dockerfilePath": "apps/web/Dockerfile" },
      "startCommand": "npm run start"
    },
    {
      "name": "outbox-worker",
      "plugin": "docker",
      "build": { "dockerfilePath": "apps/web/Dockerfile" },
      "startCommand": "npm run outbox:worker"
    },
    {
      "name": "deposit-worker",
      "plugin": "docker",
      "build": { "dockerfilePath": "apps/web/Dockerfile" },
      "startCommand": "npm run deposit:watch:bsc"
    }
  ]
}
```

8. Fill in required environment variables (see section 1) in Railway's **Variables** tab. Promote shared values via the ⋮ menu if you use the same key across services.
9. Attach a PostgreSQL plugin to the environment; Railway will automatically provide `DATABASE_URL`.

Once the initial setup is complete you can deploy by pushing to `main`. The default docker build uses BuildKit and the Metal environment; adjust as needed in the dashboard.

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

Status heartbeat expectation toggles (recommended for `/status`):
- `EXPECT_OUTBOX_WORKER=1`
- `EXPECT_DEPOSIT_SCAN=1`
- `EXPECT_SWEEP_DEPOSITS=1` (only if sweep is enabled)
- `EXPECT_P2P_EXPIRE_ORDERS=1`
- `EXPECT_ARCADE_RESOLVE_READY=1` (if arcade cron is enabled)

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

## 6) Paid Railway cutover runbook (coinwaka.com) — 2026-02-26

Use this when moving from free-tier cron providers to Railway-native scheduling.

### 6.1) Do not delete these services

- Keep the main web service (domain attached): `tradesynapsev2-production.up.railway.app` + `coinwaka.com`
- Keep the Railway Postgres service
- Do **not** click “Delete service” on either web or Postgres

If you want to retire old automation, disable/delete only external cron jobs (cron-job.org), not Railway services.

### 6.2) Immediate safety actions

- Rotate any secret that has appeared in screenshots/chats/UI captures
- At minimum rotate:
  - `CITADEL_MASTER_SEED`
  - `DEPLOYER_PRIVATE_KEY`
  - `PROOFPACK_SESSION_SECRET`
  - `PROOFPACK_SESSION_BOOTSTRAP_KEY`
  - `EXCHANGE_ADMIN_KEY`
  - `EXCHANGE_CRON_SECRET` (and `CRON_SECRET`/`P2P_CRON_SECRET` if used)
  - Third-party API keys in use (`RESEND_API_KEY`, `GROQ_API_KEY`, `GOOGLE_API_KEY`, etc.)

### 6.3) Domain + app vars for coinwaka.com

Set these on Railway shared variables and redeploy:

- `NEXT_PUBLIC_BASE_URL=https://coinwaka.com`
- `ALLOWED_ORIGIN=https://coinwaka.com` or include this in `ALLOWED_ORIGINS`
- `BACKEND_CORS_ORIGINS` should include `https://coinwaka.com`

Sanity check:
- `https://coinwaka.com/api/system/version` should return `ok`
- `https://coinwaka.com/status` should load

### 6.4) Migrate your 8 cron jobs to Railway Scheduler

Create these in **web service → Settings → Cron Schedule** (one schedule per endpoint):

1. Every 1 min
  - `GET /api/exchange/cron/outbox-worker?max_ms=8000&batch=25&max_batches=2`
2. Every 2 min
  - `GET /api/exchange/cron/scan-deposits?confirmations=2&native=1&tokens=1&symbols=USDT,USDC&max_ms=8000&max_blocks=40&blocks_per_batch=20`
3. Every 1–2 min
  - `GET /api/exchange/cron/finalize-deposits?max=250&max_ms=15000`
4. Every 10–15 min (optional)
  - `GET /api/exchange/cron/sweep-deposits?execute=1&tokens=0`
5. Every 1 min
  - `GET /api/p2p/cron/expire-orders?limit=50`
6. Every 2–5 min
  - `GET /api/cron/ops-alerts`
7. Every 1–2 min (if enabled)
  - `GET /api/cron/notifications-digest`
8. Every 1–2 min (if enabled)
  - `GET /api/arcade/cron/resolve-ready`

Auth for all cron calls:
- Prefer `x-cron-secret: <EXCHANGE_CRON_SECRET>` header when scheduler supports headers
- If using query fallback, use `?secret=actual_secret_value` (never include angle brackets)

### 6.5) Why you saw 502 on notifications-digest

Most common causes in this stack:

- container restarting (OOM / crash loop)
- deployment in-progress while cron fires
- cron endpoint unauthorized due to missing/mismatched secret
- DB transient/connectivity issue

Quick checks:

- Railway deployment logs around failure time (look for OOM, restart, uncaught error)
- confirm `EXCHANGE_CRON_SECRET` is set and matches what scheduler sends
- confirm `DATABASE_URL` is valid and DB is healthy
- temporarily set digest cadence to every 5 minutes while stabilizing

### 6.6) Cutover sequence from cron-job.org

1. Add Railway cron schedules (disabled at first, or staggered start)
2. Manually hit one endpoint and confirm 200 + heartbeat freshness in `/status`
3. Enable Railway schedules
4. Watch `/status` and logs for 10–15 minutes
5. Disable all cron-job.org jobs
6. Remove secrets from old cron URLs and keep old jobs deleted/disabled

### 6.7) Production toggles to verify

- `EXCHANGE_ENABLE_DEPOSIT_SCAN=1`
- `EXCHANGE_ENABLE_CONDITIONAL_ORDERS=1` (only if you run that cron)
- `EXCHANGE_ENABLE_NOTIFICATIONS_DIGEST=1` (if you expect digest)
- `EXCHANGE_ENABLE_PRICE_ALERTS=1` (if you run price-alert cron)
- `EXPECT_OUTBOX_WORKER=1`
- `EXPECT_DEPOSIT_SCAN=1`
- `EXPECT_SWEEP_DEPOSITS=1` only when sweep is enabled

## 7) Decommissioning / Service deletion

When this project is truly finished and you no longer need the Railway service, delete it from the dashboard:

1. Open the Railway environment and select the **web** service you want to remove.
2. Go to **Settings** and scroll to the bottom, then click **Delete service**.
3. Confirm the prompt – this permanently removes all deployments, variables, and metadata.

- **Be certain** you no longer need the domain, database, logs, or any data before proceeding.
- If you only need to retire cron jobs or stop spending, disable schedules and remove environment variables instead of deleting the service.

Use this step only as a final cleanup; earlier sections of this checklist cover going live and ongoing operation.

