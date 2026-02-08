import Link from "next/link";
import type { HoldRow, Market, BalanceRow, TicketRequirement } from "../types";

function isEffectivelyZero(b: BalanceRow | null): boolean {
  if (!b) return true;
  const avail = Number(b.available ?? 0);
  const held = Number(b.held ?? 0);
  return avail + held === 0;
}

export function BalancesPanel(props: {
  nowMs: number;
  accountTsMs: number | null;
  market: Market | null;
  baseBalance: BalanceRow | null;
  quoteBalance: BalanceRow | null;
  ticketRequirement: TicketRequirement | null;
  hasSufficientFunds: boolean | null;
  holds: HoldRow[];
  formatDecimal: (value: string, digits: number) => string;
}) {
  const { nowMs, accountTsMs, market, baseBalance, quoteBalance, ticketRequirement, hasSufficientFunds, holds, formatDecimal } = props;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Balances</h3>
        <div className="text-[11px] text-[var(--muted)]">
          {accountTsMs ? `updated ${Math.max(0, Math.floor((nowMs - accountTsMs) / 1000))}s ago` : ""}
        </div>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">Available = posted − active holds.</p>

      {(() => {
        if (!market) return <div className="mt-3 text-xs text-[var(--muted)]">—</div>;

        const base = baseBalance;
        const quote = quoteBalance;

        /* ── Empty-state onboarding ── */
        if (isEffectivelyZero(base) && isEffectivelyZero(quote)) {
          return (
            <div className="mt-3 flex flex-col items-center gap-3 rounded-xl border border-dashed border-cyan-500/40 bg-cyan-500/5 px-4 py-6 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <p className="text-sm font-medium text-[var(--foreground)]">No balances yet</p>
              <p className="text-xs text-[var(--muted)]">
                Deposit BEP-20 tokens to start trading on TradeSynapse.
              </p>
              <Link
                href="/wallet"
                className="mt-1 rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent)]/80"
              >
                Go to Wallet &rarr;
              </Link>
            </div>
          );
        }

        const baseSym = base?.symbol ?? "BASE";
        const quoteSym = quote?.symbol ?? "QUOTE";

        const required = (() => {
          try {
            if (!ticketRequirement) return null;
            return { asset: ticketRequirement.requiredAsset, amount: ticketRequirement.requiredAmount };
          } catch {
            return null;
          }
        })();

        const hasEnough = (() => {
          try {
            return hasSufficientFunds;
          } catch {
            return null;
          }
        })();

        const reqCls =
          hasEnough == null
            ? ""
            : hasEnough
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400";

        const holdsRelevant = holds.filter(
          (h) => h.status === "active" && (h.asset_id === market.base_asset_id || h.asset_id === market.quote_asset_id)
        );

        return (
          <div className="mt-3 grid gap-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded border border-[var(--border)] px-3 py-2">
                <div className="text-[11px] text-[var(--muted)]">{baseSym}</div>
                <div className="mt-1 grid gap-1 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--muted)]">avail</span>
                    <span>{base?.available ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--muted)]">held</span>
                    <span>{base?.held ?? "—"}</span>
                  </div>
                </div>
              </div>

              <div className="rounded border border-[var(--border)] px-3 py-2">
                <div className="text-[11px] text-[var(--muted)]">{quoteSym}</div>
                <div className="mt-1 grid gap-1 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--muted)]">avail</span>
                    <span>{quote?.available ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--muted)]">held</span>
                    <span>{quote?.held ?? "—"}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border)] px-3 py-2">
              <div className="text-[11px] text-[var(--muted)]">Required for current ticket</div>
              <div className={`font-mono ${reqCls}`}>{required ? `${formatDecimal(required.amount, 6)} ${required.asset}` : "—"}</div>
            </div>

            <div className="rounded border border-[var(--border)] px-3 py-2">
              <div className="mb-1 text-[11px] text-[var(--muted)]">Active holds (this market)</div>
              {holdsRelevant.length === 0 ? (
                <div className="text-xs text-[var(--muted)]">—</div>
              ) : (
                <div className="grid gap-1">
                  {holdsRelevant.slice(0, 8).map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-2 font-mono">
                      <span className="truncate text-[var(--muted)]" title={h.reason}>
                        {h.symbol} {h.reason}
                      </span>
                      <span>{h.remaining_amount}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
