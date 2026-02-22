"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { ApiError, fetchJsonOrThrow } from "@/lib/api/client";

export function ResetPasswordClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = useMemo(() => pw.length >= 8 && pw === pw2 && token.length > 0, [pw, pw2, token]);

  async function submit() {
    setStatus("loading");
    setErr(null);
    try {
      await fetchJsonOrThrow("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, newPassword: pw }),
      });
      setStatus("success");
    } catch (e) {
      setStatus("idle");
      if (e instanceof ApiError) {
        if (e.code === "invalid_or_expired_token") {
          setErr("This link is invalid or has expired.");
          return;
        }
        setErr(typeof e.details === "string" ? e.details : e.code);
        return;
      }
      setErr("Network error — please try again.");
    }
  }

  if (!token) {
    return (
      <div className="text-center">
        <div className="mb-3 text-3xl">🔗</div>
        <h2 className="text-lg font-semibold">Missing reset token</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Please use the link from your password reset email.</p>
        <Link
          href="/forgot-password"
          className="mt-4 inline-block rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-medium text-white transition hover:brightness-110"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="text-center">
        <div className="mb-3 text-3xl">✅</div>
        <h2 className="text-lg font-semibold text-emerald-500">Password updated</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">You can now log in with your new password.</p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-medium text-white transition hover:brightness-110"
        >
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center">
        <div className="mb-3 text-3xl">🔒</div>
        <h2 className="text-lg font-semibold">Set a new password</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Choose a strong password (min 8 characters).</p>
      </div>

      <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">New password</label>
        <input
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          type="password"
          placeholder="Min 8 characters"
          className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
        />

        <label className="mt-4 block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Confirm password</label>
        <input
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          type="password"
          placeholder="Repeat password"
          className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
        />

        {err ? <div className="mt-2 text-xs text-[var(--down)]">{err}</div> : null}
        {pw2 && pw !== pw2 ? <div className="mt-2 text-xs text-[var(--warn)]">Passwords do not match.</div> : null}

        <button
          type="button"
          disabled={!canSubmit || status === "loading"}
          onClick={() => void submit()}
          className="mt-4 w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {status === "loading" ? "Updating…" : "Update password"}
        </button>
      </div>

      <div className="mt-4 text-center text-xs text-[var(--muted)]">
        <Link className="underline hover:text-[var(--foreground)]" href="/login">Back to login</Link>
      </div>
    </div>
  );
}
