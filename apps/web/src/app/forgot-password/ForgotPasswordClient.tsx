"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { ApiError, fetchJsonOrThrow } from "@/lib/api/client";

export function ForgotPasswordClient() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  const canSubmit = useMemo(() => email.trim().includes("@"), [email]);

  async function submit() {
    setStatus("loading");
    setErr(null);
    setDevResetUrl(null);
    try {
      const res = await fetchJsonOrThrow<{ ok?: boolean; resetUrl?: string | null }>("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setDevResetUrl(res.resetUrl ?? null);
      setStatus("sent");
    } catch (e) {
      setStatus("idle");
      if (e instanceof ApiError) {
        setErr(typeof e.details === "string" ? e.details : e.code);
      } else {
        setErr("Network error — please try again.");
      }
    }
  }

  if (status === "sent") {
    return (
      <div className="text-center">
        <div className="mb-3 text-3xl">📨</div>
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          If an account exists for <span className="font-semibold text-[var(--foreground)]">{email.trim()}</span>, we sent a password reset link.
        </p>
        {devResetUrl ? (
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-left">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Dev reset link</div>
            <Link className="mt-2 block break-all text-xs text-[var(--accent)] underline" href={devResetUrl}>
              {devResetUrl}
            </Link>
          </div>
        ) : null}
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-medium text-white transition hover:brightness-110"
          >
            Back to login
          </Link>
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] px-5 py-2 text-xs font-medium transition hover:bg-[color-mix(in_srgb,var(--card)_70%,transparent)]"
            onClick={() => {
              setStatus("idle");
              setEmail("");
            }}
          >
            Send again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center">
        <div className="mb-3 text-3xl">🔑</div>
        <h2 className="text-lg font-semibold">Reset your password</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Enter your account email and we’ll send a reset link.</p>
      </div>

      <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="you@example.com"
          className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
        />

        {err ? <div className="mt-2 text-xs text-[var(--down)]">{err}</div> : null}

        <button
          type="button"
          disabled={!canSubmit || status === "loading"}
          onClick={() => void submit()}
          className="mt-4 w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {status === "loading" ? "Sending…" : "Send reset link"}
        </button>
      </div>

      <div className="mt-4 text-center text-xs text-[var(--muted)]">
        <Link className="underline hover:text-[var(--foreground)]" href="/login">Back to login</Link>
      </div>
    </div>
  );
}
