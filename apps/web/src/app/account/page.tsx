import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { AccountClient } from "./AccountClient";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <AccountClient />
      </main>
    </SiteChrome>
  );
}
