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

export default function SignupPage({
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
        <h1 className="text-2xl font-extrabold tracking-tight">Create account</h1>
        <p className="text-sm text-[var(--v2-muted)]">Create an exchange account for spot markets, wallet rails, and P2P.</p>
      </header>

      <V2Card>
        <V2CardHeader title="Get started" subtitle="Email verification is recommended." />
        <V2CardBody>
          <Suspense>
            <AuthClient variant="page" initialMode="signup" />
          </Suspense>

          <div className="mt-4">
            <Link href={`/login${nextQuery}`} className={v2ButtonClassName({ variant: "secondary", fullWidth: true })}>
              Already have an account? Log in
            </Link>
          </div>
        </V2CardBody>
      </V2Card>
    </main>
  );
}
