import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { HomeClient } from "./HomeClient";

export const metadata: Metadata = { title: "Home" };
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">
        <HomeClient />
      </main>
    </SiteChrome>
  );
}
