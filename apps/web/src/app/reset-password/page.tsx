import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { ResetPasswordClient } from "./ResetPasswordClient";

export const metadata: Metadata = { title: "Reset Password" };
export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-md px-6 py-16">
        <ResetPasswordClient />
      </main>
    </SiteChrome>
  );
}
