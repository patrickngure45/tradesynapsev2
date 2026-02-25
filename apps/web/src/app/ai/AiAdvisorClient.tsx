"use client";




type ScamType = {
  name: string;
  risk: "critical" | "high" | "medium";
  indicators: string[];
  advice: string;
};

const SCAM_TYPOLOGIES: ScamType[] = [
  {
    name: "Impersonation / Fake Support",
    risk: "critical",
    indicators: [
      "Counterparty claims to be from exchange support or a government agency",
      "Urgently asks you to withdraw to a 'safe' address",
      "Requests screen share or remote access",
      "Threatens account suspension if you don't act immediately",
    ],
    advice: "NEVER share your credentials, screen, or send funds to anyone claiming to be support. We will never ask you to withdraw funds.",
  },
  {
    name: "Pig Butchering (Romance/Investment)",
    risk: "critical",
    indicators: [
      "Met on social media / dating app, moved conversation to private chat",
      "Introduced you to a 'guaranteed' or 'exclusive' investment platform",
      "You can see 'profits' on a dashboard but cannot withdraw them",
      "Asks for increasing deposits to 'unlock' withdrawals or pay 'taxes'",
    ],
    advice: "No legitimate investment guarantees returns. If you cannot freely withdraw at any time, you are being scammed. Cease contact immediately.",
  },
  {
    name: "Advance Fee Fraud",
    risk: "high",
    indicators: [
      "You are told you won a prize, inheritance, or airdrop",
      "Must pay a 'processing fee', 'gas fee', or 'tax' to receive funds",
      "The supposed reward is disproportionately large",
      "Fees keep increasing with new reasons",
    ],
    advice: "Legitimate operations never require you to send money to receive money. Stop sending funds and report the contact.",
  },
  {
    name: "Fake Token / Rug Pull",
    risk: "high",
    indicators: [
      "Token promoted heavily on social media with unrealistic APY promises",
      "Smart contract is unverified or ownership is not renounced",
      "Liquidity is very low or locked for only a short period",
      "Developers are anonymous with no track record",
    ],
    advice: "Verify the contract on BSCScan. Check liquidity locks. Never invest more than you can afford to lose in unaudited projects.",
  },
  {
    name: "Address Poisoning",
    risk: "medium",
    indicators: [
      "Transaction history shows unexpected zero-value or dust transfers",
      "A recent address in your history looks similar to one you use — but is different",
      "You copy-paste a recipient address from recent transactions without verifying",
    ],
    advice: "ALWAYS verify the full address before sending. Use the address book/allowlist feature. Do not trust recent transaction history alone.",
  },
];

const riskColors = { critical: "bg-rose-600", high: "bg-amber-600", medium: "bg-yellow-600" };


/* ── Component ──────────────────────────────────────────────────── */

export function AiAdvisorClient() {
  /* 
   * PRODUCTION NOTE: 
   * The "Risk Simulator" has been removed from the public client. 
   * Real risk scoring happens automatically on the backend during withdrawal requests.
   * This page now serves as a Safety & Education center.
   */

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--v2-border)] p-6 bg-[var(--v2-surface)]">
        <h2 className="text-lg font-medium mb-4">Safety Center: Scam Typologies</h2>
        <p className="text-sm text-[var(--v2-muted)] mb-6">
          Our AI Risk Engine protects your account by analyzing transaction patterns in real-time. 
          Below are common threats we monitor for. Stay vigilant.
        </p>

        <div className="grid gap-4">
          {SCAM_TYPOLOGIES.map((typology) => (
            <div
              key={typology.name}
              className={`rounded-lg border border-[var(--v2-border)] p-4 transition-colors hover:bg-[var(--v2-surface-2)]`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{typology.name}</h3>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider text-white ${
                        riskColors[typology.risk]
                      }`}
                    >
                      {typology.risk} Risk
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-[var(--v2-muted)]">
                    <ul className="mb-2 list-inside list-disc space-y-1">
                      {typology.indicators.map((i, idx) => (
                        <li key={idx}>{i}</li>
                      ))}
                    </ul>
                    <div className="mt-3 rounded bg-[var(--v2-bg)] p-3 text-xs text-[var(--v2-text)]">
                      <span className="font-semibold text-emerald-500">Advice:</span> {typology.advice}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}



