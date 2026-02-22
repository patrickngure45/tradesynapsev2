"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

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
};

type NotificationPrefsResponse = {
  prefs?: Record<string, boolean>;
  known_types?: string[];
};

type NotificationSchedule = {
  quiet_enabled: boolean;
  quiet_start_min: number;
  quiet_end_min: number;
  tz_offset_min: number;
  digest_enabled: boolean;
  updated_at: string | null;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fetchOpts(extra?: RequestInit): RequestInit {
  const opts: RequestInit = { credentials: "include", ...extra };
  const headers = new Headers(extra?.headers);

  // Attach CSRF double-submit token on mutating requests.
  const method = String(opts.method ?? "GET").toUpperCase();
  if (typeof document !== "undefined" && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
    const csrf = match?.[1] ?? null;
    if (csrf && !headers.has("x-csrf-token")) headers.set("x-csrf-token", csrf);
  }

  if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
    const uid = localStorage.getItem("ts_user_id") ?? localStorage.getItem("pp_user_id");
    if (uid && !headers.has("x-user-id")) headers.set("x-user-id", uid);
  }

  opts.headers = headers;
  return opts;
}

const KYC_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  none:     { label: "Unverified",   color: "bg-zinc-600",    desc: "Complete KYC to unlock higher limits" },
  basic:    { label: "Basic",        color: "bg-blue-600",    desc: "Email verified — submit documents for full access" },
  verified: { label: "Verified",     color: "bg-emerald-600", desc: "Full access to all features" },
};

function normalizedKycLevel(raw: string | null | undefined): "none" | "basic" | "verified" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "verified" || value === "full") return "verified";
  if (value === "basic") return "basic";
  return "none";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AccountClient() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [loadMsg, setLoadMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [copiedUserId, setCopiedUserId] = useState(false);

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
  const [copiedTotpSecret, setCopiedTotpSecret] = useState(false);

  /* Passkeys (WebAuthn) */
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeys, setPasskeys] = useState<{ id: string; name: string | null; created_at: string; last_used_at: string | null }[]>([]);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyMsg, setPasskeyMsg] = useState<{ text: string; ok: boolean } | null>(null);

  /* Notification preferences */
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(() => ({
    order_placed: true,
    order_partially_filled: true,
    order_filled: true,
    order_canceled: true,
    order_rejected: true,
    price_alert: true,
    p2p_order_created: true,
    p2p_order_expiring: true,
    p2p_payment_confirmed: true,
    p2p_order_completed: true,
    p2p_order_cancelled: true,
    p2p_dispute_opened: true,
    p2p_dispute_resolved: true,
    p2p_feedback_received: true,
    arcade_ready: true,
    arcade_hint_ready: true,
    system: true,
  }));
  const [notifPrefsLoading, setNotifPrefsLoading] = useState(false);
  const [notifPrefsMsg, setNotifPrefsMsg] = useState<{ text: string; ok: boolean } | null>(null);

  /* Notification schedule (quiet hours + digest) */
  const [notifSchedule, setNotifSchedule] = useState<NotificationSchedule>(() => ({
    quiet_enabled: false,
    quiet_start_min: 22 * 60,
    quiet_end_min: 8 * 60,
    tz_offset_min: 0,
    digest_enabled: true,
    updated_at: null,
  }));
  const [notifScheduleLoading, setNotifScheduleLoading] = useState(false);
  const [notifScheduleMsg, setNotifScheduleMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const minToTime = (m: number) => {
    const mm = Math.max(0, Math.min(1439, Math.trunc(m || 0)));
    const hh = Math.floor(mm / 60);
    const mi = mm % 60;
    return `${String(hh).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
  };

  const timeToMin = (t: string) => {
    const s = String(t || "").trim();
    const match = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hh = Number(match[1]);
    const mi = Number(match[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mi)) return null;
    if (hh < 0 || hh > 23) return null;
    if (mi < 0 || mi > 59) return null;
    return hh * 60 + mi;
  };

  const load = useCallback(async () => {
    try {
      setLoadMsg(null);
      const res = await fetch("/api/account/profile", fetchOpts({ cache: "no-store" }));
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setLoadMsg({ text: "Failed to load account data", ok: false });
        return;
      }
      const data = await res.json();
      setProfile(data.user ?? null);
      setTotpEnabled(!!data.user?.totp_enabled);
      setLastLoadedAt(new Date());
      setLoadMsg(null);

      // Load passkeys (best-effort)
      try {
        const pkRes = await fetch("/api/account/passkeys", fetchOpts({ cache: "no-store" }));
        if (pkRes.ok) {
          const pkData = await pkRes.json();
          setPasskeys(Array.isArray(pkData.passkeys) ? pkData.passkeys : []);
        }
      } catch {
        // silent
      }

      // Load notification preferences (best-effort)
      try {
        const npRes = await fetch("/api/account/notification-preferences", fetchOpts({ cache: "no-store" }));
        if (npRes.ok) {
          const np = (await npRes.json().catch(() => ({}))) as NotificationPrefsResponse;
          if (np && typeof np === "object" && np.prefs && typeof np.prefs === "object") {
            setNotifPrefs(np.prefs as Record<string, boolean>);
          }
        }
      } catch {
        // silent
      }

      // Load notification schedule (best-effort)
      try {
        const nsRes = await fetch("/api/account/notification-schedule", fetchOpts({ cache: "no-store" }));
        if (nsRes.ok) {
          const ns = (await nsRes.json().catch(() => ({}))) as any;
          const s = ns?.schedule;
          if (s && typeof s === "object") {
            setNotifSchedule({
              quiet_enabled: !!s.quiet_enabled,
              quiet_start_min: Number(s.quiet_start_min ?? 22 * 60) || 22 * 60,
              quiet_end_min: Number(s.quiet_end_min ?? 8 * 60) || 8 * 60,
              tz_offset_min: Number(s.tz_offset_min ?? 0) || 0,
              digest_enabled: s.digest_enabled !== false,
              updated_at: typeof s.updated_at === "string" ? s.updated_at : null,
            });
          }
        }
      } catch {
        // silent
      }

      // Check for pending KYC submission
      if (normalizedKycLevel(data.user?.kyc_level) === "basic") {
        try {
          const kycRes = await fetch("/api/account/kyc", fetchOpts({ cache: "no-store" }));
          if (kycRes.ok) {
            const kycData = await kycRes.json();
            const hasPending = kycData.submissions?.some((s: { status: string }) => s.status === "pending_review");
            setKycPendingSubmission(!!hasPending);
          }
        } catch { /* silent */ }
      }
    } catch {
      setLoadMsg({ text: "Network error while loading account", ok: false });
    } finally {
      setLoading(false);
    }
  }, [router]);

  const setNotifCategory = async (types: string[], enabled: boolean) => {
    if (!types.length) return;
    setNotifPrefsMsg(null);
    setNotifPrefsLoading(true);
    setNotifPrefs((prev) => {
      const next = { ...(prev ?? {}) };
      for (const t of types) next[t] = enabled;
      return next;
    });

    try {
      const nextPrefs: Record<string, boolean> = { ...notifPrefs };
      for (const t of types) nextPrefs[t] = enabled;

      const res = await fetch("/api/account/notification-preferences", fetchOpts({
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prefs: nextPrefs }),
      }));
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNotifPrefsMsg({ text: msgFrom(data, "Failed to save preferences"), ok: false });
        return;
      }
      setNotifPrefs((prev) => ({ ...prev, ...nextPrefs }));
      setNotifPrefsMsg({ text: "Saved.", ok: true });
    } catch {
      setNotifPrefsMsg({ text: "Network error while saving preferences", ok: false });
    } finally {
      setNotifPrefsLoading(false);
    }
  };

  const saveNotifSchedule = async (next: NotificationSchedule) => {
    setNotifScheduleMsg(null);
    setNotifScheduleLoading(true);
    try {
      const tzOffsetMin = typeof window !== "undefined" ? -new Date().getTimezoneOffset() : next.tz_offset_min;
      const payload = {
        quiet_enabled: !!next.quiet_enabled,
        quiet_start_min: Math.max(0, Math.min(1439, Math.trunc(next.quiet_start_min))),
        quiet_end_min: Math.max(0, Math.min(1439, Math.trunc(next.quiet_end_min))),
        tz_offset_min: Math.max(-840, Math.min(840, Math.trunc(tzOffsetMin))),
        digest_enabled: !!next.digest_enabled,
      };

      const res = await fetch("/api/account/notification-schedule", fetchOpts({
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }));
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNotifScheduleMsg({ text: msgFrom(data, "Failed to save schedule"), ok: false });
        return;
      }
      setNotifSchedule((prev) => ({ ...prev, ...payload }));
      setNotifScheduleMsg({ text: "Saved.", ok: true });
    } catch {
      setNotifScheduleMsg({ text: "Network error while saving schedule", ok: false });
    } finally {
      setNotifScheduleLoading(false);
    }
  };

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setPasskeySupported(typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined");
  }, []);

  const msgFrom = (v: unknown, fallback: string) => {
    if (!v || typeof v !== "object") return fallback;
    const o = v as Record<string, unknown>;
    const m = o.message;
    const e = o.error;
    if (typeof m === "string" && m.trim()) return m;
    if (typeof e === "string" && e.trim()) return e;
    return fallback;
  };

  const refreshPasskeys = async () => {
    try {
      const pkRes = await fetch("/api/account/passkeys", fetchOpts({ cache: "no-store" }));
      if (!pkRes.ok) return;
      const pkData = await pkRes.json();
      setPasskeys(Array.isArray(pkData.passkeys) ? pkData.passkeys : []);
    } catch {
      // silent
    }
  };

  const handleAddPasskey = async () => {
    setPasskeyMsg(null);
    if (!passkeySupported) {
      setPasskeyMsg({ text: "Passkeys aren’t supported in this browser/device.", ok: false });
      return;
    }

    const name = (window.prompt("Name this passkey (optional)", "This device") ?? "").trim();

    setPasskeyLoading(true);
    try {
      const optRes = await fetch("/api/account/passkeys/register/options", fetchOpts({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(name ? { name } : {}),
      }));
      const optData = (await optRes.json().catch(() => ({}))) as unknown;
      if (!optRes.ok) {
        setPasskeyMsg({ text: msgFrom(optData, "Failed to start passkey registration"), ok: false });
        return;
      }

      const optObj = optData && typeof optData === "object" ? (optData as Record<string, unknown>) : null;
      const regOptions = optObj?.options;
      if (!regOptions) {
        setPasskeyMsg({ text: "Invalid passkey registration options", ok: false });
        return;
      }

      const attResp = await startRegistration(regOptions as Parameters<typeof startRegistration>[0]);

      const verRes = await fetch("/api/account/passkeys/register/verify", fetchOpts({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name || undefined, response: attResp }),
      }));
      const verData = (await verRes.json().catch(() => ({}))) as unknown;
      if (!verRes.ok) {
        setPasskeyMsg({ text: msgFrom(verData, "Passkey verification failed"), ok: false });
        return;
      }

      setPasskeyMsg({ text: "Passkey added.", ok: true });
      await refreshPasskeys();
    } catch (e: unknown) {
      const text = e instanceof Error ? e.message : "Passkey registration canceled";
      setPasskeyMsg({ text, ok: false });
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleConfirmPasskey = async () => {
    setPasskeyMsg(null);
    if (!passkeySupported) {
      setPasskeyMsg({ text: "Passkeys aren’t supported in this browser/device.", ok: false });
      return;
    }

    setPasskeyLoading(true);
    try {
      const optRes = await fetch("/api/account/passkeys/authenticate/options", fetchOpts({ method: "POST" }));
      const optData = (await optRes.json().catch(() => ({}))) as unknown;
      if (!optRes.ok) {
        setPasskeyMsg({ text: msgFrom(optData, "Failed to start passkey confirmation"), ok: false });
        return;
      }

      const optObj = optData && typeof optData === "object" ? (optData as Record<string, unknown>) : null;
      const authOptions = optObj?.options;
      if (!authOptions) {
        setPasskeyMsg({ text: "Invalid passkey authentication options", ok: false });
        return;
      }

      const asrt = await startAuthentication(authOptions as Parameters<typeof startAuthentication>[0]);
      const verRes = await fetch("/api/account/passkeys/authenticate/verify", fetchOpts({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: asrt }),
      }));
      const verData = (await verRes.json().catch(() => ({}))) as unknown;
      if (!verRes.ok) {
        setPasskeyMsg({ text: msgFrom(verData, "Passkey verification failed"), ok: false });
        return;
      }

      setPasskeyMsg({ text: "Passkey confirmed (valid for a few minutes).", ok: true });
      await refreshPasskeys();
    } catch (e: unknown) {
      const text = e instanceof Error ? e.message : "Passkey confirmation canceled";
      setPasskeyMsg({ text, ok: false });
    } finally {
      setPasskeyLoading(false);
    }
  };

  /* ── Logout ──────────────────────────────────────────────────── */
  const handleLogout = async () => {
    await fetch("/api/auth/logout", fetchOpts({ method: "POST" }));
    localStorage.removeItem("ts_user_id");
    router.push("/login");
    router.refresh();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setLoadMsg((prev) => prev ?? { text: "Account refreshed", ok: true });
    setRefreshing(false);
  };

  const handleCopyUserId = async () => {
    if (!profile?.id) return;
    try {
      await navigator.clipboard.writeText(profile.id);
      setCopiedUserId(true);
      setTimeout(() => setCopiedUserId(false), 1200);
    } catch {
      setLoadMsg({ text: "Could not copy User ID", ok: false });
    }
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

  const handleCopyTotpSecret = async () => {
    if (!totpSecret) return;
    try {
      await navigator.clipboard.writeText(totpSecret);
      setCopiedTotpSecret(true);
      setTimeout(() => setCopiedTotpSecret(false), 1200);
    } catch {
      setTotpMsg({ text: "Could not copy secret key", ok: false });
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

  const currentKyc = normalizedKycLevel(profile.kyc_level);
  const kyc = KYC_LABELS[currentKyc] ?? KYC_LABELS.none!;
  const securityChecks = {
    emailVerified: profile.email_verified,
    strongAuthEnabled: totpEnabled || passkeys.length > 0,
    kycVerified: currentKyc === "verified",
  };
  const securityScore = Object.values(securityChecks).filter(Boolean).length;

  return (
    <div className="space-y-8">
      {/* ────── Header ────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            Manage your profile, security, and verification
          </p>
          {lastLoadedAt && (
            <p className="mt-1 text-[11px] text-[var(--muted)]">Updated {lastLoadedAt.toLocaleTimeString()}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--card-2)] disabled:opacity-60"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-rose-500/40 px-4 py-1.5 text-xs font-medium text-rose-500 transition hover:bg-rose-500/10"
          >
            Sign Out
          </button>
        </div>
      </div>

      {loadMsg && (
        <div className={`rounded-lg border px-4 py-2 text-xs ${loadMsg.ok ? "border-emerald-500/30 text-emerald-500" : "border-rose-500/30 text-rose-500"}`}>
          {loadMsg.text}
        </div>
      )}

      {/* ────── Profile Card ────── */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="mb-4 text-sm font-semibold tracking-tight">Profile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--muted)]">User ID</span>
              <button
                type="button"
                onClick={handleCopyUserId}
                className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                {copiedUserId ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-0.5 break-all font-mono text-xs">{profile.id}</p>
          </div>
          <Field label="Email" value={profile.email} />
          <Field label="Display Name" value={profile.display_name ?? "—"} />
          <Field label="Status" value={profile.status} badge badgeColor={profile.status === "active" ? "bg-emerald-600" : "bg-rose-600"} />
          <Field label="Email Verified" value={profile.email_verified ? "Yes" : "No"} badge badgeColor={profile.email_verified ? "bg-emerald-600" : "bg-amber-600"} />
          <Field label="Member Since" value={new Date(profile.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} />
          <Field label="Country" value={profile.country ?? "Not set"} />
        </div>
      </section>

      {/* ────── Passkeys ────── */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="mb-2 text-sm font-semibold tracking-tight">Passkeys</h2>
        <p className="mb-4 text-xs text-[var(--muted)]">
          Use a device passkey (biometrics / screen lock) for stronger security and faster verification.
        </p>

        {!passkeySupported ? (
          <p className="text-xs text-[var(--muted)]">Passkeys aren’t available in this browser/device.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAddPasskey}
                disabled={passkeyLoading}
                className="rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {passkeyLoading ? "Working…" : "Add passkey"}
              </button>
              <button
                type="button"
                onClick={handleConfirmPasskey}
                disabled={passkeyLoading || passkeys.length === 0}
                className="rounded-lg border border-[var(--border)] px-5 py-2 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--card-2)] disabled:opacity-60"
              >
                Confirm passkey
              </button>
              {passkeyMsg && (
                <span className={`text-xs ${passkeyMsg.ok ? "text-emerald-500" : "text-rose-500"}`}>{passkeyMsg.text}</span>
              )}
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_90%,transparent)] p-4">
              <p className="mb-2 text-[11px] text-[var(--muted)]">Enrolled passkeys</p>
              {passkeys.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">No passkeys yet.</p>
              ) : (
                <div className="space-y-2">
                  {passkeys.map((pk) => (
                    <div key={pk.id} className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium">{pk.name ?? "Passkey"}</p>
                        <p className="text-[11px] text-[var(--muted)]">Added {new Date(pk.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="text-[11px] text-[var(--muted)]">
                        {pk.last_used_at ? `Last used ${new Date(pk.last_used_at).toLocaleDateString()}` : "Not used yet"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ────── Notifications ────── */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="mb-2 text-sm font-semibold tracking-tight">Notifications</h2>
        <p className="mb-4 text-xs text-[var(--muted)]">
          Choose which in-app notifications you want to receive.
        </p>

        {notifPrefsMsg && (
          <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${notifPrefsMsg.ok ? "border-emerald-500/30 text-emerald-500" : "border-rose-500/30 text-rose-500"}`}>
            {notifPrefsMsg.text}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <PrefToggle
            label="Order updates"
            hint="Placed, fills, cancels"
            enabled={!!notifPrefs.order_filled && !!notifPrefs.order_partially_filled && !!notifPrefs.order_canceled && !!notifPrefs.order_placed}
            loading={notifPrefsLoading}
            onChange={(v) =>
              setNotifCategory([
                "order_placed",
                "order_partially_filled",
                "order_filled",
                "order_canceled",
                "order_rejected",
              ], v)
            }
          />
          <PrefToggle
            label="Price alerts"
            hint="Threshold triggers"
            enabled={!!notifPrefs.price_alert}
            loading={notifPrefsLoading}
            onChange={(v) => setNotifCategory(["price_alert"], v)}
          />
          <PrefToggle
            label="P2P updates"
            hint="Orders, disputes, feedback"
            enabled={
              !!notifPrefs.p2p_order_created &&
              !!notifPrefs.p2p_payment_confirmed &&
              !!notifPrefs.p2p_order_completed &&
              !!notifPrefs.p2p_order_cancelled &&
              !!notifPrefs.p2p_dispute_opened
            }
            loading={notifPrefsLoading}
            onChange={(v) =>
              setNotifCategory(
                [
                  "p2p_order_created",
                  "p2p_order_expiring",
                  "p2p_payment_confirmed",
                  "p2p_order_completed",
                  "p2p_order_cancelled",
                  "p2p_dispute_opened",
                  "p2p_dispute_resolved",
                  "p2p_feedback_received",
                ],
                v,
              )
            }
          />
          <PrefToggle
            label="Arcade updates"
            hint="Reveals and hints"
            enabled={!!notifPrefs.arcade_ready && !!notifPrefs.arcade_hint_ready}
            loading={notifPrefsLoading}
            onChange={(v) => setNotifCategory(["arcade_ready", "arcade_hint_ready"], v)}
          />
        </div>

        <p className="mt-3 text-[11px] text-[var(--muted)]">
          Tip: disabling a category prevents new notifications from being created.
        </p>

        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_90%,transparent)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-[var(--foreground)]">Quiet hours + digest</div>
              <div className="mt-1 text-[11px] text-[var(--muted)]">During quiet hours, notifications are bundled into a digest.</div>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]">
              <span className="text-[var(--muted)]">Enable</span>
              <input
                type="checkbox"
                checked={!!notifSchedule.quiet_enabled}
                onChange={(e) => {
                  const next = { ...notifSchedule, quiet_enabled: e.target.checked };
                  setNotifSchedule(next);
                  void saveNotifSchedule(next);
                }}
                disabled={notifScheduleLoading}
                className="h-4 w-4 accent-[var(--accent)]"
              />
            </label>
          </div>

          {notifScheduleMsg ? (
            <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${notifScheduleMsg.ok ? "border-emerald-500/30 text-emerald-500" : "border-rose-500/30 text-rose-500"}`}>
              {notifScheduleMsg.text}
            </div>
          ) : null}

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <label className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs">
              <span className="text-[var(--muted)]">Start</span>
              <input
                type="time"
                value={minToTime(notifSchedule.quiet_start_min)}
                onChange={(e) => {
                  const v = timeToMin(e.target.value);
                  if (v == null) return;
                  const next = { ...notifSchedule, quiet_start_min: v };
                  setNotifSchedule(next);
                  void saveNotifSchedule(next);
                }}
                disabled={!notifSchedule.quiet_enabled || notifScheduleLoading}
                className="rounded bg-transparent text-xs font-semibold text-[var(--foreground)]"
              />
            </label>

            <label className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs">
              <span className="text-[var(--muted)]">End</span>
              <input
                type="time"
                value={minToTime(notifSchedule.quiet_end_min)}
                onChange={(e) => {
                  const v = timeToMin(e.target.value);
                  if (v == null) return;
                  const next = { ...notifSchedule, quiet_end_min: v };
                  setNotifSchedule(next);
                  void saveNotifSchedule(next);
                }}
                disabled={!notifSchedule.quiet_enabled || notifScheduleLoading}
                className="rounded bg-transparent text-xs font-semibold text-[var(--foreground)]"
              />
            </label>

            <label className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs">
              <span className="text-[var(--muted)]">Digest</span>
              <input
                type="checkbox"
                checked={!!notifSchedule.digest_enabled}
                onChange={(e) => {
                  const next = { ...notifSchedule, digest_enabled: e.target.checked };
                  setNotifSchedule(next);
                  void saveNotifSchedule(next);
                }}
                disabled={!notifSchedule.quiet_enabled || notifScheduleLoading}
                className="h-4 w-4 accent-[var(--accent)]"
              />
            </label>
          </div>

          <div className="mt-2 text-[11px] text-[var(--muted)]">
            Uses your device timezone automatically.
          </div>
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
              <TierRow tier="none" label="Unverified" limit="$0" req="—" current={currentKyc} />
              <TierRow tier="basic" label="Basic" limit="$2,000" req="Email verified" current={currentKyc} />
              <TierRow tier="verified" label="Verified" limit="$50,000" req="ID document + selfie" current={currentKyc} />
            </tbody>
          </table>
        </div>

        {/* ── KYC Action Area ── */}
        {currentKyc === "none" && (
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

        {currentKyc === "basic" && !kycPendingSubmission && (
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
                    className="text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]"
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

        {(kycPendingSubmission || currentKyc === "basic") && kycPendingSubmission && (
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
                <div className="rounded-lg border border-[var(--border)] bg-white p-2">
                  <QRCodeSVG
                    value={totpUri}
                    size={160}
                    level="M"
                    includeMargin
                    bgColor="#ffffff"
                    fgColor="#000000"
                    title="TOTP QR Code"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] text-[var(--muted)]">Or enter this key manually:</p>
                  <code className="block break-all rounded bg-zinc-900 px-3 py-2 font-mono text-xs tracking-wider text-emerald-400">
                    {totpSecret}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyTotpSecret}
                    className="rounded border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--muted)] transition hover:text-[var(--foreground)]"
                  >
                    {copiedTotpSecret ? "Copied" : "Copy setup key"}
                  </button>
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
        <div className="mb-3 flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${securityScore >= 2 ? "bg-emerald-500" : "bg-amber-500"}`}></div>
          <p className="text-xs text-[var(--muted)]">
            {securityScore === 3 ? "Strong account posture." : `Security checks complete: ${securityScore}/3`}
          </p>
        </div>
        <div className="grid gap-2 text-xs">
          <StatusRow label="Email verified" ok={securityChecks.emailVerified} />
          <StatusRow label="Strong auth enabled" ok={securityChecks.strongAuthEnabled} />
          <StatusRow label="KYC verified" ok={securityChecks.kycVerified} />
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

function PrefToggle({
  label,
  hint,
  enabled,
  loading,
  onChange,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  loading: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_90%,transparent)] px-4 py-3">
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className="mt-0.5 text-[11px] text-[var(--muted)]">{hint}</p>
      </div>
      <button
        type="button"
        disabled={loading}
        onClick={() => onChange(!enabled)}
        className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition disabled:opacity-60 ${
          enabled
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
            : "border-[var(--border)] bg-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
        }`}
      >
        {enabled ? "On" : "Off"}
      </button>
    </div>
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

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
      <span className="text-[var(--muted)]">{label}</span>
      <span className={`rounded-full px-2 py-0.5 font-semibold ${ok ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"}`}>
        {ok ? "Complete" : "Pending"}
      </span>
    </div>
  );
}
