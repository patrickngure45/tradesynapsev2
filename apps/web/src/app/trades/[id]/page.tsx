import Link from "next/link";

import { SiteChrome } from "@/components/SiteChrome";

import { TradeDetailClient } from "./TradeDetailClient";

export const dynamic = "force-dynamic";

export default async function TradeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <SiteChrome>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Trade</h1>
          <div className="flex gap-4">
            <Link className="underline" href="/trades">
              Trades
            </Link>
            <Link className="underline" href="/">
              Home
            </Link>
          </div>
        </div>

        <TradeDetailClient tradeId={id} />
      </main>
    </SiteChrome>
  );
}
