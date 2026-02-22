import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { StatusClient } from "./StatusClient";

export const metadata: Metadata = { title: "Status" };
export const dynamic = "force-dynamic";

export default function StatusPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">
        <StatusClient />
      </main>
    </SiteChrome>
  );
}
