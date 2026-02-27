# Deposits Scope (Locked for stabilization)

Last updated: 2026-02-24

This document locks the deposit system scope during stabilization to prevent scope creep.
It is referenced by DEPOSITS_TODO.md.

## Chain

- **BNB Smart Chain (BSC) mainnet** only.

## Confirmations

- **2 confirmations** required before credit.

## SLA

- Target: deposits appear in the wallet within **2–5 minutes** after reaching 2 confirmations.

## Assets (allowlist)

### Native

- **BNB** (native)

### Tokens

- **USDT** (BEP-20)
- **USDC** (BEP-20)

Notes
- No “scan all enabled tokens” in production.
- Add tokens later only after paid RPC + worker isolation is stable.

## Operational constraints

- Deposit scanning runs in a **separate worker service** from the web UI.
- Sweeping is **off** until credits are boring.
- Scanner uses hard caps (`max_blocks`, `max_ms`, `blocks_per_batch`) to prevent OOM/restarts.
