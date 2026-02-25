# Observability (Request IDs + Error Reporting)

Last updated: 2026-02-24

## Request IDs

CoinWaka attaches an `x-request-id` header to responses in the proxy layer.

Where it is set
- The proxy is in [apps/web/src/proxy.ts](apps/web/src/proxy.ts).

How the UI can access it
- For API calls made via `fetchJsonOrThrow`, the last request id is stored in:
  - `sessionStorage["ts.last_request_id"]`

Support workflow
- When a user reports an issue, ask for:
  - timestamp
  - user email
  - last seen `x-request-id` (or the `ts.last_request_id` value)

## Error reporting (Sentry)

We support optional Sentry wiring.

Environment variables
- Server: `SENTRY_DSN`
- Client: `NEXT_PUBLIC_SENTRY_DSN`

Behavior
- If no DSN is set, Sentry is effectively disabled.

## Service heartbeat monitoring (`/status`)

The status endpoint degrades when expected cron/worker services are stale.

Enable expectation toggles (Railway env):
- `EXPECT_OUTBOX_WORKER=1` → expects `outbox-worker`
- `EXPECT_DEPOSIT_SCAN=1` → expects `deposit-scan:bsc`
- `EXPECT_SWEEP_DEPOSITS=1` → expects `sweep-deposits:bsc`
- `EXPECT_P2P_EXPIRE_ORDERS=1` → expects `p2p:expire-orders`
- `EXPECT_ARCADE_RESOLVE_READY=1` → expects `arcade:resolve-ready`

Feature toggles that automatically add expectations:
- `EXCHANGE_ENABLE_CONDITIONAL_ORDERS=1` → expects `exchange:conditional-orders`
- `EXCHANGE_ENABLE_PRICE_ALERTS=1` → expects `cron:price-alerts`
- `EXCHANGE_ENABLE_NOTIFICATIONS_DIGEST=1` → expects `cron:notifications-digest`
