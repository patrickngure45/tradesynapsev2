# Rate-limit Coverage Audit (2026-02-25)

Generated from a static scan of mutating API route handlers (`POST|PUT|PATCH|DELETE`) in `src/app/api/**/route.ts`.

## Summary

- Total mutating routes: **149**
- Routes with explicit route-level limiter usage: **110**
- Routes with business-state limits only (cooldown/uniqueness/already-claimed style): **16**
- Routes relying on global proxy tiers only: **23**

Global proxy protection currently in place:
- `auth` tier: 20/min
- `exchange-write` tier: 40/min
- `api-write` tier: 80/min (mutating non-cron)
- `api` tier: 120/min

See also: `RATE_LIMIT_POLICY.md`.

## Important caveats

- “Global proxy only” does **not** mean unprotected.
  - These routes still receive global proxy throttling.
- Static scan can miss custom limiter patterns that don’t match common signatures.
- Some routes intentionally rely on business-state caps (e.g., once-per-day claims) plus proxy tiers.

## Current route-level limiter coverage (110)

Coverage now includes all previously listed user-facing routes **plus** mutating admin routes that pass through `requireAdminForApi`.

Key additions in this slice:
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/signup/route.ts`
- `src/app/api/auth/session/route.ts`
- `src/app/api/auth/logout/route.ts`
- `src/app/api/exchange/evacuate/route.ts`
- Shared cron auth helper + optional IP allowlist support (`src/lib/auth/cronAuth.ts`) applied across cron routes.

- `src/app/api/account/password/route.ts`
- `src/app/api/account/sessions/logout-all/route.ts`
- `src/app/api/account/totp/setup/route.ts`
- `src/app/api/account/totp/verify/route.ts`
- `src/app/api/account/totp/enable/route.ts`
- `src/app/api/account/totp/disable/route.ts`
- `src/app/api/account/passkeys/register/options/route.ts`
- `src/app/api/account/passkeys/register/verify/route.ts`
- `src/app/api/account/passkeys/authenticate/options/route.ts`
- `src/app/api/account/passkeys/authenticate/verify/route.ts`

- `src/app/api/auth/password-reset/confirm/route.ts`
- `src/app/api/auth/password-reset/request/route.ts`
- `src/app/api/exchange/deposits/report/route.ts`
- `src/app/api/exchange/deposits/trace/route.ts`
- `src/app/api/exchange/conditional-orders/route.ts`
- `src/app/api/exchange/convert/execute/route.ts`
- `src/app/api/exchange/orders/[id]/cancel/route.ts`
- `src/app/api/exchange/orders/route.ts`
- `src/app/api/exchange/recurring-buys/route.ts`
- `src/app/api/exchange/transfers/request/route.ts`
- `src/app/api/exchange/twap/route.ts`
- `src/app/api/exchange/withdrawals/allowlist/route.ts`
- `src/app/api/exchange/withdrawals/request/route.ts`
- `src/app/api/p2p/ads/route.ts`
- `src/app/api/p2p/payment-methods/route.ts`
- `src/app/api/p2p/my-ads/[id]/route.ts`
- `src/app/api/p2p/orders/[id]/action/route.ts`
- `src/app/api/p2p/orders/[id]/chat/route.ts`
- `src/app/api/p2p/orders/[id]/dispute/route.ts`
- `src/app/api/p2p/orders/[id]/feedback/route.ts`
- `src/app/api/p2p/orders/route.ts`

## Priority candidates for additional route-level limits

These are high-risk mutating surfaces currently classified as global-only and should be considered for user-scoped route-level caps:

1. Scheduler/dev-only mutating endpoints
  - `src/app/api/**/cron/**` routes
  - `src/app/api/**/dev/**` routes

## Remaining global-only reachability

After the latest rollout, the remaining **23** global-only routes are all scheduler/dev surfaces.

- **Secret-gated cron routes (internal trigger in production, now with optional IP allowlists):**
  - `src/app/api/arcade/cron/resolve-ready/route.ts`
  - `src/app/api/cron/email-notifications/route.ts`
  - `src/app/api/cron/notifications-digest/route.ts`
  - `src/app/api/cron/ops-alerts/route.ts`
  - `src/app/api/exchange/cron/conditional-orders/route.ts`
  - `src/app/api/exchange/cron/finalize-deposits/route.ts`
  - `src/app/api/exchange/cron/outbox-worker/route.ts`
  - `src/app/api/exchange/cron/recurring-buys/route.ts`
  - `src/app/api/exchange/cron/scan-deposits/route.ts`
  - `src/app/api/exchange/cron/sweep-deposits/route.ts`
  - `src/app/api/exchange/cron/twap/route.ts`
  - `src/app/api/p2p/cron/expire-orders/route.ts`

- **Dev-only endpoints (blocked in production via `NODE_ENV` checks):**
  - `src/app/api/dev/kyc-approve/route.ts`
  - `src/app/api/dev/seed/route.ts`
  - `src/app/api/dev/users/route.ts`
  - `src/app/api/earn/dev/seed-products/route.ts`
  - `src/app/api/exchange/dev/credit/route.ts`
  - `src/app/api/exchange/dev/deposit/route.ts`
  - `src/app/api/exchange/dev/seed-assets/route.ts`
  - `src/app/api/exchange/dev/seed-execution/route.ts`
  - `src/app/api/exchange/dev/seed-liquidity/route.ts`
  - `src/app/api/exchange/dev/seed-markets/route.ts`
  - `src/app/api/exchange/dev/seed-open-book/route.ts`

## Suggested next slice

Keep cron/dev routes on secret-auth + proxy tiers by default; only add route-level guards where there is a concrete abuse path or externally reachable trigger.

Keep cron endpoints primarily secret-authenticated and monitored, with optional IP-tier tightening only if scheduler topology is stable.

For stricter network controls, configure `EXCHANGE_CRON_ALLOWED_IPS` (and `P2P_CRON_ALLOWED_IPS` for P2P) with scheduler egress IPs.
