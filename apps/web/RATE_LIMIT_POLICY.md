# Rate-Limit Policy

Last updated: 2026-02-25

This document is the baseline abuse-control policy for web/API traffic.

## Global proxy tiers (src/proxy.ts)

Applied per IP in the proxy layer (PostgreSQL-backed when available, in-memory fallback otherwise):

- `auth`: **20 req/min**
  - Matches: `/api/auth/*`
  - Purpose: brute-force mitigation on login/signup/session auth paths.

- `exchange-write`: **40 req/min**
  - Matches: mutating methods on `/api/exchange/orders*` and `/api/exchange/withdrawals*`
  - Purpose: tighter cap on trading/withdrawal mutation surfaces.

- `api-write`: **80 req/min**
  - Matches: mutating API requests (`POST|PUT|PATCH|DELETE`) on `/api/*`
  - Excludes cron paths:
    - `/api/cron/*`
    - `/api/arcade/cron/*`
    - `/api/exchange/cron/*`
    - `/api/p2p/cron/*`
  - Purpose: default write protection for all other mutation endpoints.

- `api`: **120 req/min**
  - Matches: remaining API traffic (`/api/*`)
  - Purpose: read-heavy baseline protection.

- `page`: no global proxy RL
  - Matches: non-API page navigations.

## Route-level overrides (already in code)

Some sensitive routes add stricter user-scoped DB limiters in their handlers. These remain authoritative on top of proxy IP caps.

Examples:
- Exchange: placement/cancel, withdrawals, allowlist, deposit trace/report
- P2P: order create/action/chat/dispute/feedback
- Auth: password-reset request/confirm
- Admin writes: mutating endpoints behind `requireAdminForApi` use centralized admin-scoped throttling (`admin.write`)

## Enforcement model

- First gate: proxy rate limiting (IP-based, broad protection)
- Second gate: route-level limiter (user/email/resource scoped where needed)
- Optional third gate: business-state limits (cooldowns, once-per-day, uniqueness constraints)

## Operational guidance

- Keep endpoint-specific limits stricter than or equal to global limits when abuse risk is high.
- Adjust limits with observed traffic and support incidents, not ad hoc.
- Prefer route-level user-scoped limiters for authenticated mutation endpoints.
- Keep cron/authenticated machine endpoints out of browser-oriented write tiers when they already use shared-secret auth.

## Cron route network controls

Secret-gated cron routes now use shared auth logic in `src/lib/auth/cronAuth.ts` and support optional source-IP allowlists.

- Default secret env precedence:
  - `EXCHANGE_CRON_SECRET`, fallback `CRON_SECRET`
- Optional IP allowlist env precedence:
  - `EXCHANGE_CRON_ALLOWED_IPS`, fallback `CRON_ALLOWED_IPS`
- P2P cron uses P2P-first envs:
  - secrets: `P2P_CRON_SECRET`, `EXCHANGE_CRON_SECRET`, `CRON_SECRET`
  - allowlist: `P2P_CRON_ALLOWED_IPS`, `EXCHANGE_CRON_ALLOWED_IPS`, `CRON_ALLOWED_IPS`

Allowlist format: comma-separated exact IPs (first IP from `x-forwarded-for` is used when present).
