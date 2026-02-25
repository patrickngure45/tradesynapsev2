# BSC RPC Plan (Production)

Last updated: 2026-02-24

Deposits are only as reliable as `eth_getLogs` throughput.
Public BSC RPC endpoints will eventually rate-limit or stall.

## Requirement (non-negotiable)

- A paid RPC plan that supports heavy `eth_getLogs` without unpredictable throttling.
- Support for WebSocket is a bonus, not required for the current scanner.

## Recommended providers (pick one)

- Ankr (BSC premium)
- QuickNode (BSC)
- Chainstack (BSC)
- Alchemy (if your plan supports BSC reliably)

## Configuration

- Set `BSC_RPC_URL` to your primary paid endpoint.
- Set `BSC_RPC_URLS` to 1–3 fallbacks (same provider or secondary provider).
- Keep `BSC_RPC_STALL_TIMEOUT_MS=2000` (tune later if needed).

## Success criteria

- Deposit scanner runs for 24h with no manual restarts.
- Cursor lag stays bounded (no falling behind by hours).
- No OOM/restart loops from log queries.
