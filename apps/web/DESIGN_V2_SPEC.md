# Coinwaka v2 — Mobile Exchange UX Spec (Spot-first)

This is the single source of truth for the **v2 MVP UI** redesign.

For the full platform blueprint (margin/derivatives/earn/pay/institutional, etc.), see DESIGN_PLATFORM_SPEC.md.

## Product stance
- Goal: **“Binance, but better”** on mobile: fewer taps, less clutter, clearer states, higher trust.
- Scope (v1): **Spot trading**, deposits/withdrawals, P2P escrow, notifications.
- Out of scope (v1): futures, margin, earn/launchpad, complex pro tooling.

## Navigation (mobile-first)
Bottom nav (5 tabs):
1) Markets
2) Trade
3) Orders
4) Wallet
5) Account

Default launch behavior:
- If user has a last traded pair: open **Trade** on that pair.
- Otherwise open **Markets**.

## Global UX rules
- Touch targets: primary interactive controls must feel easy to hit (no tiny buttons).
- Loading:
  - Skeleton-first for lists/cards.
  - “Optimistic UI” only when safe (e.g., local tab switches), never for balances.
- Error states:
  - Always show: what happened + what to do next.
  - Avoid raw codes in UI.
- Sheets/modals:
  - Use bottom sheets for selection (pair selector, asset selector).
  - Use modals only for confirmations or critical warnings.
- Status language:
  - Deposits: pending → confirmed → credited (plus failed/reverted).
  - Orders: open → partially filled → filled / canceled / rejected.

## Tab specs (what users see)

### 1) Markets
Above the fold:
- Search input (opens full-screen/bottom-sheet search on mobile)
- Favorites row (if any)
- Movers: Top gainers/losers (compact)
- Market list (USDT pairs default)

Core interactions:
- Tap a pair → opens Trade for that pair
- Long-press / star → favorite

### 2) Trade (primary)
Single screen with segmented sections (thumb reachable):
- Header: pair + price + 24h change; tap opens pair selector sheet
- Segment: Chart | Order Book | Trades
- Sticky order panel:
  - Buy/Sell toggle
  - Amount input + slider
  - Order type: Market/Limit
  - Primary CTA button (Buy/Sell)

Immediate feedback:
- “Placing order…” → “Order placed” → updates Orders tab in realtime

### 3) Orders
Tabs:
- Open
- History
- Fills

Above the fold:
- Open orders list with cancel actions
- Clear status chips and timestamps

### 4) Wallet
Above the fold:
- Total balance (primary number)
- Quick actions: Deposit / Withdraw / Transfer
- Recent activity (deposits/withdrawals/fills)

Deposit flow:
- Deposit address + network warnings
- Pending confirmations list
- Trace/Post assistance (self-serve) with clear diagnostics

Withdraw flow:
- Address + network + amount
- Fee transparency
- Risk/limits messaging when applicable

### 5) Account
- Security: sessions, password, TOTP/passkeys
- Verification: email + KYC
- Preferences: notification schedule
- Support/legal links

## Migration strategy
- Build v2 UI under a route group `(v2)` and migrate screens one-by-one.
- Keep backend + APIs intact; only swap frontend.
- De-risk: each migrated screen must be shippable and complete.

## Definition of “done” for v2 MVP
- Markets, Trade, Orders, Wallet, Account are fully migrated.
- Mobile UX meets the global rules above.
- Consistent components, no legacy page styling in migrated screens.
