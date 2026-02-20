import { SiteChrome } from "@/components/SiteChrome";
import { BRAND_NAME } from "@/lib/seo/brand";

export const metadata = { title: `Help Center — ${BRAND_NAME}` };

export default function HelpCenterPage() {
  return (
    <SiteChrome>
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">How can we help you?</h1>
        <div className="relative mb-8">
            <input 
              type="text" 
              placeholder="Search for articles..." 
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 pl-10 text-sm shadow-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
             <svg className="absolute left-3 top-3.5 h-4 w-4 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
             </svg>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
            {[
                { title: "Account Functions", icon: "👤", items: ["Reset Password", "Enable 2FA", "Identity Verification (KYC)"] },
                { title: "Spot Trading", icon: "📊", items: ["How to spot trade", "Understanding Order Types", "Trading Fees"] },
                { title: "P2P Trading", icon: "🤝", items: ["How to buy crypto via P2P", "How to sell crypto via P2P", "Appeal Process"] },
                { title: "Arbitrage Scanner", icon: "🚀", items: ["Connecting Exchange Keys", "Understanding Spread", "Auto-Trade Risks"] },
                { title: "Deposits & Withdrawals", icon: "💳", items: ["Crypto Deposit FAQ", "Withdrawal Limits", "Missing Deposit"] },
                { title: "Security", icon: "🛡️", items: ["Phishing Prevention", "Device Management", "Suspicious Activity"] }
            ].map((cat) => (
                <div key={cat.title} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 hover:border-[var(--accent)] transition cursor-pointer">
                    <div className="text-2xl mb-3">{cat.icon}</div>
                    <h3 className="font-semibold mb-3">{cat.title}</h3>
                    <ul className="space-y-2">
                        {cat.items.map(item => (
                            <li key={item} className="text-xs text-[var(--muted)] hover:text-[var(--accent)] hover:underline">
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>

        <div className="mt-12 rounded-xl bg-[var(--card-2)] p-8 text-center">
            <h3 className="font-semibold mb-2">Still need help?</h3>
            <p className="text-sm text-[var(--muted)] mb-4">Our support team is available 24/7 to assist you.</p>
            <button className="rounded-lg bg-[var(--foreground)] px-6 py-2 text-sm font-medium text-[var(--background)] hover:opacity-90">
                Contact Support
            </button>
        </div>
      </div>
    </SiteChrome>
  );
}
