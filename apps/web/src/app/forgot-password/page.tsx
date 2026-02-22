import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { ForgotPasswordClient } from "./ForgotPasswordClient";

export const metadata: Metadata = { title: "Forgot Password" };
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-md px-6 py-16">
        <ForgotPasswordClient />
      </main>
    </SiteChrome>
  );
}
