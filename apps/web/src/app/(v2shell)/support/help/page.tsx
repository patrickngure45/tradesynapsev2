import { LastRequestIdCard } from "@/components/LastRequestIdCard";

export const dynamic = "force-dynamic";

export default function HelpCenterPage() {
  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Support</div>
        <h1 className="text-2xl font-extrabold tracking-tight">How can we help you?</h1>
      </header>

      <div>
        <LastRequestIdCard compact />
      </div>

      <div className="relative">
        <input
          type="text"
          placeholder="Search for articles..."
          className="w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-4 py-3 pl-10 text-sm shadow-[var(--v2-shadow-sm)] outline-none focus:ring-2 focus:ring-[var(--v2-ring)]"
        />
        <svg className="absolute left-3 top-3.5 h-4 w-4 text-[var(--v2-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { title: "Account Functions", icon: "👤", items: ["Reset Password", "Enable 2FA", "Identity Verification (KYC)"] },
          { title: "Spot Trading", icon: "📊", items: ["How to spot trade", "Understanding Order Types", "Trading Fees"] },
          { title: "P2P Trading", icon: "🤝", items: ["How to buy crypto via P2P", "How to sell crypto via P2P", "Appeal Process"] },
          { title: "Arbitrage Scanner", icon: "🚀", items: ["Connecting Exchange Keys", "Understanding Spread", "Auto-Trade Risks"] },
          { title: "Deposits & Withdrawals", icon: "💳", items: ["Crypto Deposit FAQ", "Withdrawal Limits", "Missing Deposit"] },
          { title: "Security", icon: "🛡️", items: ["Phishing Prevention", "Device Management", "Suspicious Activity"] },
        ].map((cat) => (
          <div
            key={cat.title}
            className="rounded-[var(--v2-radius-lg)] border border-[var(--v2-border)] bg-[var(--v2-surface)] p-4 shadow-[var(--v2-shadow-sm)]"
          >
            <div className="text-2xl mb-3">{cat.icon}</div>
            <h3 className="font-semibold mb-3">{cat.title}</h3>
            <ul className="space-y-2">
              {cat.items.map((item) => (
                <li key={item} className="text-xs text-[var(--v2-muted)] hover:text-[var(--v2-accent)] hover:underline">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="rounded-[var(--v2-radius-lg)] border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-6 text-center shadow-[var(--v2-shadow-sm)]">
        <h3 className="font-semibold mb-2">Still need help?</h3>
        <p className="text-sm text-[var(--v2-muted)] mb-4">Our support team is available 24/7 to assist you.</p>
        <button className="rounded-xl bg-[var(--v2-text)] px-6 py-2 text-sm font-semibold text-[var(--v2-bg)] hover:opacity-90">
          Contact Support
        </button>
      </div>
    </main>
  );
}
