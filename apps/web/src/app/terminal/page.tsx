import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { TerminalClient } from "./terminalClient";

export const metadata: Metadata = { title: "Terminal" };
export const dynamic = "force-dynamic";

export default function TerminalPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6">
        <TerminalClient />
      </main>
    </SiteChrome>
  );
}
