import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { VerifyEmailClient } from "./VerifyEmailClient";

export const metadata: Metadata = { title: "Verify Email" };
export const dynamic = "force-dynamic";

export default function VerifyEmailPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-md px-6 py-16">
        <VerifyEmailClient />
      </main>
    </SiteChrome>
  );
}
