import { SiteChrome } from "@/components/SiteChrome";
import { AiAdvisorClient } from "./AiAdvisorClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Security Center — TradeSynapse",
  description: "Learn about common scam typologies and how our AI protects your funds.",
};

export default function AiPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Security Center</h1>
          <p className="text-sm text-[var(--muted)]">
            Our AI-powered risk engine works in the background to protect your funds. Learn how to stay safe.
          </p>
        </header>

        <div className="mt-6">
          <AiAdvisorClient />
        </div>
      </main>
    </SiteChrome>
  );
}
