"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export function VerifyEmailClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error" | "no-token">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("no-token");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/account/verify-email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (res.ok && data.verified) {
          setStatus("success");
        } else {
          setStatus("error");
          setErrorMsg(data.error === "invalid_or_expired_token" ? "This link is invalid or has expired." : (data.error ?? "Verification failed."));
        }
      } catch {
        setStatus("error");
        setErrorMsg("Network error — please try again.");
      }
    })();
  }, [token]);

  if (status === "loading") {
    return (
      <div className="text-center">
        <div className="mb-3 text-3xl">✉️</div>
        <p className="text-sm text-[var(--muted)]">Verifying your email…</p>
      </div>
    );
  }

  if (status === "no-token") {
    return (
      <div className="text-center">
        <div className="mb-3 text-3xl">🔗</div>
        <h2 className="text-lg font-semibold">Missing verification token</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Please use the link from your verification email.
        </p>
        <Link
          href="/account"
          className="mt-4 inline-block rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-medium text-white transition hover:brightness-110"
        >
          Go to Account
        </Link>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="text-center">
        <div className="mb-3 text-3xl">⚠️</div>
        <h2 className="text-lg font-semibold text-rose-500">Verification Failed</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{errorMsg}</p>
        <Link
          href="/account"
          className="mt-4 inline-block rounded-lg border border-[var(--border)] px-5 py-2 text-xs font-medium transition hover:bg-[color-mix(in_srgb,var(--card)_70%,transparent)]"
        >
          Back to Account
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="mb-3 text-3xl">✅</div>
      <h2 className="text-lg font-semibold text-emerald-500">Email Verified!</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Your email has been verified and your account has been upgraded to Basic KYC.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          href="/exchange"
          className="rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-medium text-white transition hover:brightness-110"
        >
          Start Trading
        </Link>
        <Link
          href="/account"
          className="rounded-lg border border-[var(--border)] px-5 py-2 text-xs font-medium transition hover:bg-[color-mix(in_srgb,var(--card)_70%,transparent)]"
        >
          View Account
        </Link>
      </div>
    </div>
  );
}
