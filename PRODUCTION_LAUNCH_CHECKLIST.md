# Production Launch Checklist – Feb 27, 2026

**Status**: Live at https://coinwaka.com/v2

## ✅ What We've Done So Far

1. **Cron jobs** – Added 6 GitHub Actions workflows:
   - exchange-outbox-worker (every 1 min)
   - exchange-scan-deposits (every 2 min)
   - exchange-finalize-deposits (every 2 min)
   - exchange-sweep-deposits (every 15 min)
   - p2p-expire-orders (every 1 min)
   - cron-ops-alerts (every 5 min)

2. **Railway setup docs** – Added comprehensive go-live checklist in `RAILWAY_GO_LIVE.md`

3. **Admin 2FA reset** – Created script: `npm run user:reset-2fa`

---

## 🔴 IMMEDIATE ACTIONS NEEDED

### Step 1: Reset Admin 2FA

Your account is locked behind 2FA. Reset it:

```bash
cd apps/web
EMAIL=ngurengure10@gmail.com CONFIRM_RESET_2FA=RESET_2FA npm run user:reset-2fa
```

This clears your TOTP secret so you can log in normally. You can re-enable 2FA after login if needed.

### Step 2: Verify Production Env Vars

The app needs these to work properly. Check that Railway has them set:

#### **Critical for deposits to work:**
- `EXCHANGE_ENABLE_DEPOSIT_SCAN=1` ← **Must be "1" or deposits won't scan**
- `EXCHANGE_ENABLE_SWEEP_DEPOSITS=1` ← Optional but recommended
- `DEPOSIT_SCAN_SYMBOLS=USDT,USDC` ← Which tokens to accept
- `BSC_RPC_URL` ← Must be a valid/paid RPC endpoint (free ones are throttled)
- `CITADEL_MASTER_SEED` ← HD wallet seed for deposit address derivation

#### **Critical for cron jobs:**
- `EXCHANGE_CRON_SECRET` ← Must match what GitHub Actions sends
- `DATABASE_URL` ← Properly connected Postgres
- `NEXT_PUBLIC_BASE_URL=https://coinwaka.com/v2`
- `ALLOWED_ORIGINS=https://coinwaka.com`

#### **For email notifs (optional):**
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `EMAIL_FROM`, `EMAIL_FROM_NAME`
- Or use Resend: `RESEND_API_KEY`

#### **For evidence storage (optional but recommended):**
- `EVIDENCE_STORAGE=s3` (not "local" — local disk is ephemeral on Railway)
- S3 credentials if using S3

Check your Railway dashboard → **web service → Variables** and verify all are populated.

---

## 📋 Deposit Flow Verification

### Test 1: Check if deposits are enabled

```bash
# From your local machine or a terminal logged into coinwaka.com/v2:
curl https://coinwaka.com/v2/status

# Look for something like:
# {
#   "outbox_worker": {..., "fresh": true},
#   "deposit_scan": {..., "fresh": true},  ← should show heartbeat
#   "sweep_deposits": {..., "fresh": true}
# }
```

### Test 2: Check system version

```bash
curl https://coinwaka.com/v2/api/system/version
# Expected: { "ok": true, "commit": "...", "service": "web", "env": "production" }
```

### Test 3: Do a test deposit

1. Log into https://coinwaka.com/v2 with your admin account (after 2FA reset).
2. Go to **Wallet** → **Deposits** (if nav exists).
3. Check if a USDT/USDC deposit address appears.
4. Send a small amount of USDT/USDC to that address (on BSC mainnet).
5. Wait 2–3 minutes for the cron job to scan.
6. Check if the deposit appears in your balance.

If the deposit doesn't appear:
- Check `/status` — is `deposit_scan` showing a fresh heartbeat?
- Check Railway logs for the web service and deposit-worker.
- Check `EXCHANGE_ENABLE_DEPOSIT_SCAN=1` is actually set.
- Check `BSC_RPC_URL` — free RPC endpoints are rate-limited; use a paid one.

### Test 4: Run the postdeploy smoke test

From `apps/web`:

```bash
BASE_URL=https://coinwaka.com/v2 npm run smoke:postdeploy
```

Expected: All checks pass, including deposit endpoints, auth, and cron endpoints returning `200`.

---

## 🚀 Feature Toggles to Review

Once deposits are confirmed working, enable other features:

```
EXCHANGE_ENABLE_CONDITIONAL_ORDERS=1      (if you want users to place conditional trades)
EXCHANGE_ENABLE_PRICE_ALERTS=1            (if you want price notifications)
EXCHANGE_ENABLE_NOTIFICATIONS_DIGEST=1    (if you want email digests)
```

These are safe — they're opt-in and don't affect core functionality.

---

## 🔄 Cron Job Health

Watch `/status` after pushing commits. All 6 cron jobs should show fresh heartbeats (within the last few minutes):

- `/api/exchange/cron/outbox-worker` — every 1 min
- `/api/exchange/cron/scan-deposits` — every 2 min
- `/api/exchange/cron/finalize-deposits` — every 2 min
- `/api/exchange/cron/sweep-deposits` — every 15 min
- `/api/p2p/cron/expire-orders` — every 1 min
- `/api/cron/ops-alerts` — every 5 min

If any are stale check Railway logs for errors.

---

## 📝 Next Steps

1. **Commit and push** the new cron workflows:
   ```bash
   git add .github/workflows/*.yml apps/web/scripts/reset-admin-2fa.ts apps/web/package.json railway.json
   git commit -m "Add production cron jobs and admin 2FA reset script"
   git push origin main
   ```

2. **Reset your admin 2FA**:
   ```bash
   EMAIL=ngurengure10@gmail.com CONFIRM_RESET_2FA=RESET_2FA npm run user:reset-2fa
   ```

3. **Verify env vars** on Railway dashboard.

4. **Test deposits** following the steps above.

5. **Monitor logs** via Railway dashboard for 15 minutes.

6. **Announce go-live** once all tests pass ✅

---

## 🆘 Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Deposits not appearing | `EXCHANGE_ENABLE_DEPOSIT_SCAN` not set | Set to `1` in Railway Variables |
| 502 on deposit scan | OOM / container restart | Check Railway logs; increase RAM or split into separate worker |
| `status` shows stale heartbeats | Cron jobs not firing | Check GitHub Actions workflow history; ensure secrets are set |
| Cron job 404 | Wrong cron-secret header | Verify `EXCHANGE_CRON_SECRET` matches in GitHub secrets |
| Outbox worker backing up | Slow DB / mail server | Increase `OUTBOX_BATCH` or add more replicas |

---

