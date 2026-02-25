import Link from "next/link";
import { Suspense } from "react";

import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { v2ButtonClassName } from "@/components/v2/Button";
import { AuthClient } from "@/app/login/AuthClient";

export const dynamic = "force-dynamic";

function sanitizeInternalRedirectPath(input: string | null | undefined, fallback = ""): string {
  const raw = String(input ?? "").trim();
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (raw.includes("\\")) return fallback;
  return raw;
}

export default function LoginPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const next = sanitizeInternalRedirectPath(typeof searchParams?.next === "string" ? searchParams.next : "", "");
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Account</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Log in</h1>
        <p className="text-sm text-[var(--v2-muted)]">Sign in to access wallet rails, spot markets, and P2P.</p>
      </header>

      <V2Card>
        <V2CardHeader title="Welcome back" subtitle="Use your email + password. 2FA supported." />
        <V2CardBody>
          <Suspense>
            <AuthClient variant="page" initialMode="login" />
          </Suspense>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link href={`/signup${nextQuery}`} className={v2ButtonClassName({ variant: "secondary", fullWidth: true })}>
              Create account
            </Link>
            <Link href="/forgot-password" className={v2ButtonClassName({ variant: "secondary", fullWidth: true })}>
              Forgot password
            </Link>
          </div>
        </V2CardBody>
      </V2Card>
    </main>
  );
}
