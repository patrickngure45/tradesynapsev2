import type { Metadata } from "next";
import { Suspense } from "react";

import { SiteChrome } from "@/components/SiteChrome";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthClient } from "../login/AuthClient";

export const metadata: Metadata = { title: "Sign Up" };
export const dynamic = "force-dynamic";

export default function SignupPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const next = typeof searchParams?.next === "string" ? searchParams.next.trim() : "";
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <SiteChrome>
      <AuthShell
        title="Create your account"
        subtitle="Create an exchange account to unlock spot markets, P2P escrow, and your wallet. Email verification is recommended."
        switchHint="Already have an account?"
        switchHref={`/login${nextQuery}`}
        switchLabel="Log in"
      >
        <Suspense>
          <AuthClient variant="page" initialMode="signup" />
        </Suspense>
      </AuthShell>
    </SiteChrome>
  );
}
