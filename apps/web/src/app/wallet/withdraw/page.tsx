import type { Metadata } from "next";

import { SiteChrome } from "@/components/SiteChrome";

import { WithdrawClient } from "./WithdrawClient";

export const metadata: Metadata = { title: "Withdraw" };
export const dynamic = "force-dynamic";

export default function WithdrawPage() {
  return (
    <SiteChrome>
      <main className="mx-auto flex w-full max-w-3xl flex-col px-6 py-10 sm:py-14">
        <div className="fade-in-up">
          <WithdrawClient />
        </div>
      </main>
    </SiteChrome>
  );
}
