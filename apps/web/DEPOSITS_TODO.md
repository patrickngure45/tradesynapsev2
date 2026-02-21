# Professional Deposits: Systematic TODO (BSC-first)

This checklist is designed to eliminate guesswork and avoid repeating the same failures (cron overlap, OOM from sweeping, RPC flakiness, unclear “is it credited?” state).

## Ground rules (how we avoid loops)

- **Single source of truth**: this file is the only checklist we follow.
- **One change per step**: every step has a clear *done condition*.
- **No sweeping until credits are boring**: sweeping is optional housekeeping and must not be allowed to destabilize the site.
- **No “cron roulette”**: we keep exactly one scan job and (later) one sweep job, with stable URLs.

## Step 0 — Immediate safety (do this first)

### 0.1 Rotate exposed secrets (critical)

If secrets/keys have been shared in chat, treat them as compromised.

- Rotate **hot wallet private key** and **master seed** used for deposit address derivation.
- Rotate exchange/admin/cron secrets.
- Rotate any 3rd-party API keys.

**Done condition**
- Old keys are revoked, new keys deployed in Railway variables, and the repo has no real secrets committed.

---

## Step 1 — Decide scope (write these down before coding)

### 1.1 Chains

- Now: **BSC mainnet**
- Later: (optional) ETH, Polygon

### 1.2 Assets

Pick one:
- **Option A (recommended)**: Native BNB + allowlisted tokens: `USDT`, `USDC`, `WBNB`.
- Option B: Native only.
- Option C: “all enabled tokens” (not recommended until you have paid RPC + worker isolation).

### 1.3 Confirmation policy

- BSC: `2` confirmations (configurable)

### 1.4 SLA

- Target: deposits appear in UI within **2–5 minutes** of confirmation.

**Done condition**
- These are written into a short doc / ticket and not changed during stabilization.

---

## Step 2 — Architecture (stop coupling deposits to the web server)

### 2.1 Split into a worker (recommended)

Run deposit scanning/crediting in **a separate Railway service** (or separate process) so failures cannot 502 the website.

- **Web service**: Next.js UI + user APIs.
- **Deposit worker service**: scan/credit/sweep endpoints and/or internal loop.

**Done condition**
- Worker can restart/crash without affecting the website uptime.

### 2.2 If you cannot split today

Minimum mitigation:
- Disable sweeping.
- Enforce hard caps on scans and sweeps.

---

## Step 3 — Paid services (what’s worth paying for)

### 3.1 BSC RPC (required for professional reliability)

Public RPCs will rate-limit or stall under `eth_getLogs`.

Buy one that supports heavy log queries:
- **Ankr** (BSC premium endpoint)
- **QuickNode**
- **Alchemy** (if BSC supported for your plan)
- **Chainstack**

**Requirement**: reliable `eth_getLogs` throughput + predictable rate limits.

### 3.2 Monitoring (high value)

- **Sentry** (or similar) for exceptions + performance.
- Optional: uptime checks (Better Stack / UptimeRobot).

### 3.3 Scheduling

Prefer (in order):
1) Railway Cron / worker loop
2) GitHub Actions scheduled job (simple)
3) cron-job.org (works, but you must avoid overlap)

---

## Step 4 — Scanner correctness (credits must be deterministic)

### 4.1 Data model invariants

- A deposit event is **immutable** and **idempotent**.
- Crediting is **idempotent**: a confirmed event results in at most one ledger credit.

**Done condition**
- Re-running a scan over the same blocks does not create duplicates.

### 4.2 Cursor strategy

- Maintain `last_scanned_block` per chain.
- Anchor scanning using each deposit address `assigned_block` to avoid scanning from genesis.

**Done condition**
- Cursor lag stays bounded (e.g., < 10k blocks under normal operation).

### 4.3 Token strategy

- In production, **require allowlisted symbols** (`symbols=USDT,USDC,...`).
- Never default to “all enabled tokens”.

**Done condition**
- Scans do not query 300+ token contracts.

---

## Step 5 — Locking & overlap (eliminate scan_in_progress pain)

### 5.1 Set a sane scan lock TTL

- Set `EXCHANGE_SCAN_LOCK_TTL_MS=120000` (2 minutes) in Railway.

Reason: if the service restarts mid-scan, a long TTL blocks deposits.

**Done condition**
- `scan_in_progress` never holds the system for > 2 minutes.

### 5.2 Cron frequency

- Scan every **2–3 minutes**, not every minute.

---

## Step 6 — Sweeping (optional; only after credits are stable)

### 6.1 Keep sweep isolated

Sweeping must never OOM the service.

Hard requirements:
- Token allowlist only.
- Hard cap tokens per run.
- Hard cap deposit addresses per run.
- Low frequency (10–15 minutes).

**Done condition**
- Sweep can be enabled without any OOM/restart loops.

---

## Step 7 — Ops endpoints & cron URLs (final, stable)

### 7.1 Scan deposits (the only required cron)

`/api/exchange/cron/scan-deposits?secret=...&confirmations=2&native=1&tokens=1&symbols=USDT,USDC&max_ms=20000&max_blocks=120&blocks_per_batch=60`

### 7.2 Sweep deposits (optional)

Start with native-only:

`/api/exchange/cron/sweep-deposits?secret=...&execute=1&tokens=0`

---

## Step 8 — Verification (no more “I deposited and nothing happened”)

### 8.1 One-click trace for a tx hash

Add/keep an ops path that answers:
- on-chain receipt found?
- confirmations?
- does `to` match a known deposit address?
- is there a deposit event row?
- is it credited (journal_entry_id present)?

**Done condition**
- For any tx hash you can deterministically say: `not ours` | `pending` | `seen` | `credited`.

---

## Step 9 — Definition of done (ship criteria)

- Website stays up (no OOM / 502 loops) while scan job runs.
- 5 test deposits (BNB + USDT/USDC) all credit automatically within SLA.
- Scanner runs for 24 hours with bounded cursor lag and no manual intervention.
