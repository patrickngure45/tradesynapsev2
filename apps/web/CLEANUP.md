# Cleanup (remove dummy/dev data)

This repo includes dev/seed scripts and (in non-production) `/api/dev/*` routes.
When you want to clean dummy users/ads/orders from a shared DB (e.g. Railway Postgres), use the scripts below.

## 1) Delete non-core users (recommended)

This will delete **all users except** the system users + a keep-list of emails.
It will cascade-delete related rows (P2P orders/ads/payment methods, exchange orders/executions, withdrawals, sessions, etc.).

### Dry run (safe)

```bash
KEEP_USER_EMAILS="you@domain.com,other@domain.com" npm run cleanup:users
```

### Execute (destructive)

```bash
CONFIRM_CLEANUP=DELETE_NON_CORE_USERS \
KEEP_USER_EMAILS="you@domain.com,other@domain.com" \
npm run cleanup:users
```

## 2) Normalize agent balances / ads (optional)

`cleanup:agents` is **apply-gated**: it only mutates balances when you pass `--apply` (or `APPLY=1`).

Report-only:

```bash
AGENT_EMAILS="agent1@x.com,agent2@y.com" npm run cleanup:agents
```

Apply (destructive balance changes):

```bash
AGENT_EMAILS="agent1@x.com,agent2@y.com" npm run cleanup:agents -- --apply
```

## 3) Delete seeded/bot users only (keep real accounts)

If you don’t know all “real” user emails, use this safer cleanup: it deletes users that **do not** have a password set (`password_hash IS NULL`).

Dry run:

```bash
npm run cleanup:dev-users
```

Execute:

```bash
CONFIRM_CLEANUP=DELETE_DEV_USERS npm run cleanup:dev-users
```

## 4) Reset dummy balances for real users (keep accounts)

If a real user (email+password) has dev-credit balances / test withdrawals, you can zero them out safely via a balancing journal entry (no history deletion).

Dry run:

```bash
EMAILS="admin@coinwaka.com" npm run cleanup:reset-balances
```

Execute:

```bash
CONFIRM_CLEANUP=RESET_USER_BALANCES EMAILS="admin@coinwaka.com" npm run cleanup:reset-balances
```

## Notes

- Never run these scripts unless `DATABASE_URL` points at the intended database.
- Keep deposit scan/sweep disabled until you’re ready (production feature flags):
  - `EXCHANGE_ENABLE_DEPOSIT_SCAN=1`
  - `EXCHANGE_ENABLE_SWEEP_DEPOSITS=1`
