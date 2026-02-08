"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type UserProfile = {
  id: string;
  email: string;
  display_name: string | null;
  status: string;
  kyc_level: string;
  email_verified: boolean;
  country: string | null;
  created_at: string;
  pay_fees_with_tst: boolean;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fetchOpts(extra?: RequestInit): RequestInit {
  const opts: RequestInit = { credentials: "include", ...extra };
  if (typeof window !== "undefined") {
    const uid = localStorage.getItem("ts_user_id");
    if (uid) opts.headers = { ...opts.headers as Record<string,string>, "x-user-id": uid };
  }
  return opts;
}

const KYC_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  none:     { label: "Unverified",   color: "bg-zinc-600",    desc: "Complete KYC to unlock higher limits" },
  basic:    { label: "Basic",        color: "bg-blue-600",    desc: "Email verified — submit documents for full access" },
  verified: { label: "Verified",     color: "bg-emerald-600", desc: "Full access to all features" },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AccountClient() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  /* Password change */
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwTotpCode, setPwTotpCode] = useState("");
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  /* KYC */
  const [kycLoading, setKycLoading] = useState(false);
  const [kycMsg, setKycMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [kycDocType, setKycDocType] = useState<"passport" | "national_id" | "drivers_license">("passport");
  const [kycDocFront, setKycDocFront] = useState<string | null>(null);
  const [kycDocBack, setKycDocBack] = useState<string | null>(null);
  const [kycShowDocForm, setKycShowDocForm] = useState(false);
  const [kycPendingSubmission, setKycPendingSubmission] = useState(false);

  /* Email verify */
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<{ text: string; ok: boolean; url?: string } | null>(null);

  /* Fee Preference */
  const handleToggleFeePreference = async () => {
    if (!profile) return;
    const newState = !profile.pay_fees_with_tst;
    
    // Optimistic update
    setProfile(p => p ? { ...p, pay_fees_with_tst: newState } : null);

    try {
      const res = await fetch("/api/account/profile", fetchOpts({
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pay_fees_with_tst: newState }),
      }));
      if (!res.ok) throw new Error();
    } catch {
      // Revert on failure
      setProfile(p => p ? { ...p, pay_fees_with_tst: !newState } : null);
      alert("Failed to update preference");
    }
  };

  /* 2FA / TOTP */
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpStep, setTotpStep] = useState<"idle" | "setup" | "backup">("idle");
  const [totpSecret, setTotpSecret] = useState("");
  const [totpUri, setTotpUri] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpMsg, setTotpMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpBackupCodes, setTotpBackupCodes] = useState<string[]>([]);
  const [totpDisableCode, setTotpDisableCode] = useState("");
  const [totpDisableLoading, setTotpDisableLoading] = useState(false);
  const [totpDisableMsg, setTotpDisableMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/account/profile", fetchOpts({ cache: "no-store" }));
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setProfile(data.user ?? null);
      setTotpEnabled(!!data.user?.totp_enabled);

      // Check for pending KYC submission
      if (data.user?.kyc_level === "basic") {
        try {
          const kycRes = await fetch("/api/account/kyc", fetchOpts({ cache: "no-store" }));
          if (kycRes.ok) {
            const kycData = await kycRes.json();
            const hasPending = kycData.submissions?.some((s: { status: string }) => s.status === "pending_review");
            setKycPendingSubmission(!!hasPending);
          }
        } catch { /* silent */ }
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  /* ── Logout ──────────────────────────────────────────────────── */
  const handleLogout = async () => {
    await fetch("/api/auth/logout", fetchOpts({ method: "POST" }));
    localStorage.removeItem("ts_user_id");
    router.push("/login");
    router.refresh();
  };

  /* ── Password Change ─────────────────────────────────────────── */
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);

    if (newPw.length < 8) { setPwMsg({ text: "New password must be at least 8 characters", ok: false }); return; }
    if (newPw !== confirmPw) { setPwMsg({ text: "Passwords do not match", ok: false }); return; }

    setPwLoading(true);
    try {
      const res = await fetch("/api/account/password", fetchOpts({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: currentPw,
          newPassword: newPw,
          ...(pwTotpCode.length === 6 ? { totp_code: pwTotpCode } : {}),
        }),
      }));
      const data = await res.json();
      if (!res.ok) {
        setPwMsg({ text: data.error === "invalid_current_password" ? "Current password is incorrect" : data.error === "totp_required" ? "Enter your 2FA code" : data.error === "invalid_totp_code" ? "Invalid 2FA code" : (data.error ?? "Failed"), ok: false });
        return;
      }
      setPwMsg({ text: "Password updated successfully", ok: true });
      setCurrentPw(""); setNewPw(""); setConfirmPw(""); setPwTotpCode("");
    } catch {
      setPwMsg({ text: "Network error", ok: false });
    } finally {
      setPwLoading(false);
    }
  };

  /* ── KYC upgrade ─────────────────────────────────────────────── */
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleKycUpgrade = async () => {
    setKycLoading(true);
    setKycMsg(null);
    try {
      const res = await fetch("/api/account/kyc", fetchOpts({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "upgrade" }),
      }));
      const data = await res.json();
      if (!res.ok) {
        setKycMsg({ text: data.error ?? "Upgrade failed", ok: false });
        return;
      }
      setKycMsg({ text: `KYC upgraded to ${data.kyc_level}`, ok: true });
      await load();
    } catch {
      setKycMsg({ text: "Network error", ok: false });
    } finally {
      setKycLoading(false);
    }
  };

  const handleKycSubmitDocuments = async () => {
    if (!kycDocFront) {
      setKycMsg({ text: "Please upload the front of your document", ok: false });
      return;
    }
    setKycLoading(true);
    setKycMsg(null);
    try {
      const res = await fetch("/api/account/kyc", fetchOpts({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "submit_documents",
          document_type: kycDocType,
          document_front: kycDocFront,
          document_back: kycDocBack ?? undefined,
        }),
      }));
      const data = await res.json();
      if (!res.ok) {
        setKycMsg({ text: data.error ?? "Submission failed", ok: false });
        return;
      }
      setKycMsg({ text: "Documents submitted for review!", ok: true });
      setKycShowDocForm(false);
      setKycPendingSubmission(true);
      setKycDocFront(null);
      setKycDocBack(null);
    } catch {
      setKycMsg({ text: "Network error", ok: false });
    } finally {
      setKycLoading(false);
    }
  };

  /* ── Send Verification Email ─────────────────────────────────── */
  const handleSendVerification = async () => {
    setVerifyLoading(true);
    setVerifyMsg(null);
    try {
      const res = await fetch("/api/account/verify-email", fetchOpts({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "resend" }),
      }));
      const data = await res.json();
      if (!res.ok) {
        setVerifyMsg({ text: data.error === "already_verified" ? "Already verified!" : (data.error ?? "Failed"), ok: false });
        return;
      }
      setVerifyMsg({ text: "Verification link generated", ok: true, url: data.verify_url });
    } catch {
      setVerifyMsg({ text: "Network error", ok: false });
    } finally {
      setVerifyLoading(false);
    }
  };

  /* ── 2FA Setup (begin) ──────────────────────────────────────── */
  const handleTotpSetup = async () => {
    setTotpLoading(true);
    setTotpMsg(null);
    try {
      const res = await fetch("/api/account/totp/setup", fetchOpts({
        method: "POST",
      }));
      const data = await res.json();
      if (!res.ok) {
        setTotpMsg({ text: data.error ?? "Setup failed", ok: false });
        return;
      }
      setTotpSecret(data.secret);
      setTotpUri(data.uri);
      setTotpStep("setup");
    } catch {
      setTotpMsg({ text: "Network error", ok: false });
    } finally {
      setTotpLoading(false);
    }
  };

  /* ── 2FA Enable (verify code) ───────────────────────────────── */
  const handleTotpEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpLoading(true);
    setTotpMsg(null);
    try {
      const res = await fetch("/api/account/totp/enable", fetchOpts({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: totpCode }),
      }));
      const data = await res.json();
      if (!res.ok) {
        setTotpMsg({ text: data.error === "invalid_totp_code" ? "Invalid code — try again" : (data.error ?? "Failed"), ok: false });
        return;
      }
      setTotpEnabled(true);
      setTotpBackupCodes(data.backup_codes ?? []);
      setTotpStep("backup");
      setTotpCode("");
      setTotpMsg({ text: "2FA enabled!", ok: true });
    } catch {
      setTotpMsg({ text: "Network error", ok: false });
    } finally {
      setTotpLoading(false);
    }
  };

  /* ── 2FA Disable ────────────────────────────────────────────── */
  const handleTotpDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpDisableLoading(true);
    setTotpDisableMsg(null);
    try {
      const res = await fetch("/api/account/totp/disable", fetchOpts({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: totpDisableCode }),
      }));
      const data = await res.json();
      if (!res.ok) {
        setTotpDisableMsg({ text: data.error === "invalid_totp_code" ? "Invalid code" : (data.error ?? "Failed"), ok: false });
        return;
      }
      setTotpEnabled(false);
      setTotpStep("idle");
      setTotpDisableCode("");
      setTotpDisableMsg({ text: "2FA disabled", ok: true });
    } catch {
      setTotpDisableMsg({ text: "Network error", ok: false });
    } finally {
      setTotpDisableLoading(false);
    }
  };

  /* ── Render ──────────────────────────────────────────────────── */

  if (loading) {
    return <div className="py-20 text-center text-sm text-[var(--muted)]">Loading account…</div>;
  }

  if (!profile) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-[var(--muted)]">Not signed in.</p>
        <button
          onClick={() => router.push("/login")}
          className="mt-4 rounded-lg bg-[var(--accent)] px-6 py-2 text-sm font-medium text-white transition hover:brightness-110"
        >
          Sign In
        </button>
      </div>
    );
  }

  const kyc = KYC_LABELS[profile.kyc_level] ?? KYC_LABELS.none!;

  return (
    <div className="space-y-8">
      {/* ────── Header ────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            Manage your profile, security, and verification
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="rounded-lg border border-rose-500/40 px-4 py-1.5 text-xs font-medium text-rose-500 transition hover:bg-rose-500/10"
        >
          Sign Out
        </button>
      </div>

      {/* ────── Profile Card ────── */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="mb-4 text-sm font-semibold tracking-tight">Profile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="User ID" value={profile.id} mono />
          <Field label="Email" value={profile.email} />
          <Field label="Display Name" value={profile.display_name ?? "—"} />
          <Field label="Status" value={profile.status} badge badgeColor={profile.status === "active" ? "bg-emerald-600" : "bg-rose-600"} />
          <Field label="Email Verified" value={profile.email_verified ? "Yes" : "No"} badge badgeColor={profile.email_verified ? "bg-emerald-600" : "bg-amber-600"} />
          <Field label="Member Since" value={new Date(profile.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} />
          <Field label="Country" value={profile.country ?? "Not set"} />
        </div>
      </section>

      {/* ────── TST Utility / Fees ────── */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Fee Discounts</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Use TST to pay for trading fees and get a 25% discount.
            </p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input 
              type="checkbox" 
              checked={profile.pay_fees_with_tst} 
              onChange={handleToggleFeePreference} 
              className="peer sr-only" 
            />
            <div className="peer h-6 w-11 rounded-full bg-zinc-700 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[var(--accent)] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--accent)]/50"></div>
          </label>
        </div>
      </section>

      {/* ────── Email Verification ────── */}
      {!profile.email_verified && (
        <section className="rounded-xl border border-amber-500/30 bg-[color-mix(in_srgb,var(--card)_95%,#f59e0b_5%)] p-6">
          <h2 className="mb-2 text-sm font-semibold tracking-tight">Verify Your Email</h2>
          <p className="text-xs text-[var(--muted)]">
            Verify your email address to unlock Basic KYC and enable withdrawals.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={handleSendVerification}
              disabled={verifyLoading}
              className="rounded-lg bg-amber-600 px-5 py-2 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {verifyLoading ? "Sending…" : "Send Verification Email"}
            </button>
            {verifyMsg && (
              <span className={`text-xs ${verifyMsg.ok ? "text-emerald-500" : "text-rose-500"}`}>{verifyMsg.text}</span>
            )}
          </div>
          {verifyMsg?.url && (
            <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2">
              <p className="mb-1 text-[10px] text-[var(--muted)]">[DEV] Click to verify:</p>
              <a href={verifyMsg.url} className="break-all text-xs text-[var(--accent)] underline">{verifyMsg.url}</a>
            </div>
          )}
        </section>
      )}

      {/* ────── KYC Verification ────── */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight">Identity Verification (KYC)</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white ${kyc.color}`}>
            {kyc.label}
          </span>
          <span className="text-xs text-[var(--muted)]">{kyc.desc}</span>
        </div>

        {/* Tier table */}
        <div className="mt-4 overflow-hidden rounded-lg border border-[var(--border)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_80%,transparent)]">
                <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Tier</th>
                <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Daily Withdrawal</th>
                <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Requirements</th>
              </tr>
            </thead>
            <tbody>
              <TierRow tier="none" label="Unverified" limit="$0" req="—" current={profile.kyc_level} />
              <TierRow tier="basic" label="Basic" limit="$2,000" req="Email verified" current={profile.kyc_level} />
              <TierRow tier="verified" label="Verified" limit="$50,000" req="ID document + selfie" current={profile.kyc_level} />
            </tbody>
          </table>
        </div>

        {/* ── KYC Action Area ── */}
        {profile.kyc_level === "none" && (
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleKycUpgrade}
              disabled={kycLoading}
              className="rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {kycLoading ? "Processing…" : "Upgrade to Basic"}
            </button>
            {kycMsg && (
              <span className={`text-xs ${kycMsg.ok ? "text-emerald-500" : "text-rose-500"}`}>{kycMsg.text}</span>
            )}
          </div>
        )}

        {profile.kyc_level === "basic" && !kycPendingSubmission && (
          <div className="mt-4">
            {!kycShowDocForm ? (
              <button
                onClick={() => setKycShowDocForm(true)}
                className="rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-medium text-white transition hover:brightness-110"
              >
                Upgrade to Verified — Submit Documents
              </button>
            ) : (
              <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_90%,transparent)] p-4">
                <h3 className="text-xs font-semibold">Upload Identity Document</h3>

                {/* Document type selector */}
                <label className="block">
                  <span className="text-[11px] text-[var(--muted)]">Document Type</span>
                  <select
                    value={kycDocType}
                    onChange={(e) => setKycDocType(e.target.value as typeof kycDocType)}
                    className="mt-0.5 block w-full max-w-xs rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-xs outline-none transition focus:border-[var(--accent)]"
                  >
                    <option value="passport">Passport</option>
                    <option value="national_id">National ID</option>
                    <option value="drivers_license">Driver&apos;s License</option>
                  </select>
                </label>

                {/* Front of document */}
                <label className="block">
                  <span className="text-[11px] text-[var(--muted)]">Document Front *</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) setKycDocFront(await fileToBase64(f));
                    }}
                    className="mt-0.5 block w-full max-w-sm text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--accent)] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
                  />
                  {kycDocFront && <span className="mt-1 inline-block text-[10px] text-emerald-500">✓ Front uploaded</span>}
                </label>

                {/* Back of document (optional for passport) */}
                <label className="block">
                  <span className="text-[11px] text-[var(--muted)]">
                    Document Back {kycDocType === "passport" ? "(optional)" : "*"}
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) setKycDocBack(await fileToBase64(f));
                    }}
                    className="mt-0.5 block w-full max-w-sm text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--accent)] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
                  />
                  {kycDocBack && <span className="mt-1 inline-block text-[10px] text-emerald-500">✓ Back uploaded</span>}
                </label>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={handleKycSubmitDocuments}
                    disabled={kycLoading || !kycDocFront}
                    className="rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-60"
                  >
                    {kycLoading ? "Submitting…" : "Submit for Review"}
                  </button>
                  <button
                    onClick={() => { setKycShowDocForm(false); setKycDocFront(null); setKycDocBack(null); }}
                    className="text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {kycMsg && (
              <span className={`mt-2 block text-xs ${kycMsg.ok ? "text-emerald-500" : "text-rose-500"}`}>{kycMsg.text}</span>
            )}
          </div>
        )}

        {(kycPendingSubmission || profile.kyc_level === "basic") && kycPendingSubmission && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-[color-mix(in_srgb,var(--card)_95%,#f59e0b_5%)] px-4 py-3">
            <span className="text-amber-500">⏳</span>
            <span className="text-xs text-[var(--muted)]">Your documents are under review. This usually takes 1-2 business days.</span>
          </div>
        )}
      </section>

      {/* ────── Change Password ────── */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="mb-4 text-sm font-semibold tracking-tight">Change Password</h2>
        <form onSubmit={handlePasswordChange} className="max-w-sm space-y-3">
          <PwInput label="Current Password" value={currentPw} onChange={setCurrentPw} />
          <PwInput label="New Password" value={newPw} onChange={setNewPw} />
          <PwInput label="Confirm New Password" value={confirmPw} onChange={setConfirmPw} />

          {totpEnabled && (
            <label className="block">
              <span className="text-[11px] text-[var(--muted)]">2FA Code</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit code"
                value={pwTotpCode}
                onChange={(e) => setPwTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="mt-0.5 w-32 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-sm tracking-wider outline-none transition focus:border-[var(--accent)]"
                autoComplete="one-time-code"
              />
            </label>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pwLoading || !currentPw || !newPw || !confirmPw}
              className="rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {pwLoading ? "Updating…" : "Update Password"}
            </button>
            {pwMsg && (
              <span className={`text-xs ${pwMsg.ok ? "text-emerald-500" : "text-rose-500"}`}>{pwMsg.text}</span>
            )}
          </div>
        </form>
      </section>

      {/* ────── Two-Factor Authentication ────── */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="mb-2 text-sm font-semibold tracking-tight">Two-Factor Authentication (2FA)</h2>
        <p className="mb-4 text-xs text-[var(--muted)]">
          Protect your account with a time-based one-time password (TOTP) from an authenticator app.
        </p>

        {totpEnabled && totpStep !== "backup" ? (
          /* ── 2FA is enabled — show status + disable form ── */
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-emerald-500">2FA Enabled</span>
            </div>

            <form onSubmit={handleTotpDisable} className="max-w-xs space-y-3">
              <p className="text-[11px] text-[var(--muted)]">Enter your current authenticator code to disable 2FA:</p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                pattern="\d{6}"
                placeholder="000000"
                value={totpDisableCode}
                onChange={(e) => setTotpDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-32 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-center font-mono text-lg tracking-[0.3em] outline-none transition focus:border-[var(--accent)]"
              />
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={totpDisableLoading || totpDisableCode.length !== 6}
                  className="rounded-lg border border-rose-500/40 px-4 py-2 text-xs font-medium text-rose-500 transition hover:bg-rose-500/10 disabled:opacity-60"
                >
                  {totpDisableLoading ? "Disabling…" : "Disable 2FA"}
                </button>
                {totpDisableMsg && (
                  <span className={`text-xs ${totpDisableMsg.ok ? "text-emerald-500" : "text-rose-500"}`}>{totpDisableMsg.text}</span>
                )}
              </div>
            </form>
          </div>
        ) : totpStep === "idle" ? (
          /* ── Not set up — show enable button ── */
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-xs font-medium text-amber-500">Not Enabled</span>
            </div>
            <button
              onClick={handleTotpSetup}
              disabled={totpLoading}
              className="rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {totpLoading ? "Setting up…" : "Enable 2FA"}
            </button>
            {totpMsg && (
              <span className={`block text-xs ${totpMsg.ok ? "text-emerald-500" : "text-rose-500"}`}>{totpMsg.text}</span>
            )}
          </div>
        ) : totpStep === "setup" ? (
          /* ── QR code step — verify first code ── */
          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_90%,transparent)] p-4">
              <p className="mb-3 text-xs font-medium">1. Scan this code with your authenticator app:</p>
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                {/* QR code using a data URL from Google Charts API (works offline in dev) */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totpUri)}`}
                  alt="TOTP QR Code"
                  width={160}
                  height={160}
                  className="rounded-lg border border-[var(--border)]"
                />
                <div className="space-y-2">
                  <p className="text-[11px] text-[var(--muted)]">Or enter this key manually:</p>
                  <code className="block break-all rounded bg-zinc-900 px-3 py-2 font-mono text-xs tracking-wider text-emerald-400">
                    {totpSecret}
                  </code>
                </div>
              </div>
            </div>

            <form onSubmit={handleTotpEnable} className="max-w-xs space-y-3">
              <p className="text-xs font-medium">2. Enter the 6-digit code from your authenticator:</p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                pattern="\d{6}"
                placeholder="000000"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-32 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-center font-mono text-lg tracking-[0.3em] outline-none transition focus:border-[var(--accent)]"
                autoFocus
              />
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={totpLoading || totpCode.length !== 6}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-60"
                >
                  {totpLoading ? "Verifying…" : "Verify & Enable"}
                </button>
                <button
                  type="button"
                  onClick={() => { setTotpStep("idle"); setTotpMsg(null); }}
                  className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Cancel
                </button>
                {totpMsg && (
                  <span className={`text-xs ${totpMsg.ok ? "text-emerald-500" : "text-rose-500"}`}>{totpMsg.text}</span>
                )}
              </div>
            </form>
          </div>
        ) : totpStep === "backup" ? (
          /* ── Backup codes display ── */
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-emerald-500">2FA Enabled</span>
            </div>

            <div className="rounded-lg border border-amber-500/30 bg-[color-mix(in_srgb,var(--card)_95%,#f59e0b_5%)] p-4">
              <p className="mb-2 text-xs font-semibold text-amber-500">Save your backup codes!</p>
              <p className="mb-3 text-[11px] text-[var(--muted)]">
                Store these codes somewhere safe. Each can only be used once to regain access if you lose your authenticator.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {totpBackupCodes.map((code, i) => (
                  <code key={i} className="rounded bg-zinc-900 px-2 py-1.5 text-center font-mono text-xs tracking-wider text-amber-400">
                    {code}
                  </code>
                ))}
              </div>
            </div>

            <button
              onClick={() => setTotpStep("idle")}
              className="rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-medium text-white transition hover:brightness-110"
            >
              I&apos;ve Saved My Codes
            </button>
          </div>
        ) : null}
      </section>

      {/* ────── Security Info ────── */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="mb-2 text-sm font-semibold tracking-tight">Security Status</h2>
        <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
            <p className="text-xs text-[var(--muted)]">Your session is active and secure.</p>
        </div>
      </section>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function Field({ label, value, mono, badge, badgeColor }: { label: string; value: string; mono?: boolean; badge?: boolean; badgeColor?: string }) {
  return (
    <div>
      <span className="text-[11px] text-[var(--muted)]">{label}</span>
      {badge ? (
        <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${badgeColor ?? "bg-zinc-600"}`}>
          {value}
        </span>
      ) : (
        <p className={`mt-0.5 text-sm ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</p>
      )}
    </div>
  );
}

function TierRow({ tier, label, limit, req, current }: { tier: string; label: string; limit: string; req: string; current: string }) {
  const isCurrent = tier === current;
  return (
    <tr className={`border-b border-[var(--border)] last:border-b-0 ${isCurrent ? "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : ""}`}>
      <td className="px-4 py-2">
        <span className="flex items-center gap-2">
          {label}
          {isCurrent && <span className="rounded bg-[var(--accent)] px-1.5 py-px text-[9px] font-bold text-white">CURRENT</span>}
        </span>
      </td>
      <td className="px-4 py-2 font-mono">{limit}</td>
      <td className="px-4 py-2 text-[var(--muted)]">{req}</td>
    </tr>
  );
}

function PwInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] text-[var(--muted)]">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
        autoComplete="off"
      />
    </label>
  );
}
