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
