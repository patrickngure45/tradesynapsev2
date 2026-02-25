"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ApiError, fetchJsonOrThrow } from "@/lib/api/client";

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
        const data = await fetchJsonOrThrow<{ ok?: boolean; verified?: boolean; error?: string }>(
          "/api/account/verify-email",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token }),
          },
        );

        if (data.verified) {
          setStatus("success");
        } else {
          setStatus("error");
          setErrorMsg(data.error === "invalid_or_expired_token" ? "This link is invalid or has expired." : (data.error ?? "Verification failed."));
        }
      } catch (e) {
        setStatus("error");
        if (e instanceof ApiError) {
          if (e.code === "csrf_token_mismatch") {
            setErrorMsg("Security check failed (CSRF). Please refresh this page and try again.");
            return;
          }
          setErrorMsg(typeof e.details === "string" ? e.details : e.code);
          return;
        }
        setErrorMsg("Network error — please try again.");
      }
    })();
  }, [token]);

  if (status === "loading") {
    return (
      <div className="text-center">
        <div className="mb-3 text-3xl">✉️</div>
        <p className="text-sm text-[var(--v2-muted)]">Verifying your email…</p>
      </div>
    );
  }

  if (status === "no-token") {
    return (
      <div className="text-center">
        <div className="mb-3 text-3xl">🔗</div>
        <h2 className="text-lg font-semibold">Missing verification token</h2>
        <p className="mt-2 text-sm text-[var(--v2-muted)]">
          Please use the link from your verification email.
        </p>
        <Link
          href="/account"
          className="mt-4 inline-block rounded-lg bg-[var(--v2-accent)] px-5 py-2 text-xs font-medium text-white transition hover:brightness-110"
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
        <p className="mt-2 text-sm text-[var(--v2-muted)]">{errorMsg}</p>
        <Link
          href="/account"
          className="mt-4 inline-block rounded-lg border border-[var(--v2-border)] px-5 py-2 text-xs font-medium transition hover:bg-[color-mix(in_srgb,var(--v2-surface)_70%,transparent)]"
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
      <p className="mt-2 text-sm text-[var(--v2-muted)]">
        Your email has been verified and your account has been upgraded to Basic KYC.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          href="/wallet"
          className="rounded-lg bg-[var(--v2-accent)] px-5 py-2 text-xs font-medium text-white transition hover:brightness-110"
        >
          Open Wallet
        </Link>
        <Link
          href="/account"
          className="rounded-lg border border-[var(--v2-border)] px-5 py-2 text-xs font-medium transition hover:bg-[color-mix(in_srgb,var(--v2-surface)_70%,transparent)]"
        >
          View Account
        </Link>
      </div>
    </div>
  );
}
