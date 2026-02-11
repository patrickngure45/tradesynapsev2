# Exchange Relay

Tiny HTTP relay that forwards requests to supported exchange API hosts from a different egress region.

This is intended for deployments where your main app host is geo-blocked by Binance/Bybit.

## Endpoints

- `GET /health` → `{ ok: true }`
- `POST /fetch` → forwards a request and returns `{ status, body }`

`/fetch` requires `x-relay-key` if `EXCHANGE_RELAY_KEY` is set.

## Security

The relay enforces:
- `https:` only
- a hard allowlist of exchange hosts (Binance + Bybit domains)

## Deploy

Docker build uses [apps/exchange-relay/Dockerfile](apps/exchange-relay/Dockerfile).

Environment variables:
- `PORT` (default `8080`)
- `EXCHANGE_RELAY_KEY` (recommended)

## Connect the main app

Set these in the main app environment:
- `EXCHANGE_RELAY_URL` = relay base URL (no trailing slash preferred)
- `EXCHANGE_RELAY_KEY` = same value as relay

Once set, the main app will automatically fall back to the relay when direct exchange calls fail.
