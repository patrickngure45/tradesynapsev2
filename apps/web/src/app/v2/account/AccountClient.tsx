"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

import { V2Button, v2ButtonClassName } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { V2Input } from "@/components/v2/Input";
import { V2Sheet } from "@/components/v2/Sheet";
import { V2Skeleton } from "@/components/v2/Skeleton";

type ProfileUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  status: string;
  kyc_level: string;
  email_verified: boolean;
  totp_enabled: boolean;
  country: string | null;
  created_at: string;
};

type ProfileResponse = { user: ProfileUser };

type PasskeysResponse = { ok: true; passkeys: Array<{ id: string; name: string | null; created_at: string; last_used_at: string | null }> };

function msgFrom(v: unknown, fallback: string) {
  if (!v || typeof v !== "object") return fallback;
  const o = v as Record<string, unknown>;
  const m = o.message;
  const e = o.error;
  if (typeof m === "string" && m.trim()) return m;
  if (typeof e === "string" && e.trim()) return e;
  return fallback;
}

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : null;
}

type KycSubmission = {
  id: string;
  document_type: string;
  status: string;
  rejection_reason: string | null;
  submitted_at: string;
};

type KycResponse = {
  kyc_level: string;
  submissions: KycSubmission[];
};

type KycDocType = "passport" | "national_id" | "drivers_license";

type NotificationPrefs = Record<string, { in_app: boolean; email: boolean }>;
type NotificationPrefsResponse = { prefs: NotificationPrefs; known_types: string[] };

type NotificationSchedule = {
  quiet_enabled: boolean;
  quiet_start_min: number;
  quiet_end_min: number;
  tz_offset_min: number;
  digest_enabled: boolean;
  updated_at: string | null;
};

type NotificationScheduleResponse = { schedule: NotificationSchedule };

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
};

type NotificationsResponse = { notifications: NotificationRow[]; unread_count: number };

function minToTime(min: number): string {
  const m = Math.max(0, Math.min(1439, Math.trunc(min)));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function timeToMin(v: string): number {
  const s = String(v || "").trim();
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function prettyType(t: string): string {
  const s = String(t || "").replaceAll("_", " ").trim();
  return s ? s[0]!.toUpperCase() + s.slice(1) : "—";
}

function togglePill(on: boolean, labelOn: string, labelOff: string) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold " +
        (on
          ? "border-[var(--v2-border)] bg-[var(--v2-up-bg)] text-[var(--v2-up)]"
          : "border-[var(--v2-border)] bg-[var(--v2-surface-2)] text-[var(--v2-muted)]")
      }
    >
      {on ? labelOn : labelOff}
    </span>
  );
}

function pill(ok: boolean, on: string, off: string) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold " +
        (ok
          ? "border-[var(--v2-border)] bg-[var(--v2-up-bg)] text-[var(--v2-up)]"
          : "border-[var(--v2-border)] bg-[var(--v2-surface-2)] text-[var(--v2-muted)]")
      }
    >
      {ok ? on : off}
    </span>
  );
}

export function AccountClient() {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [actionStatus, setActionStatus] = useState<{ kind: "idle" | "ok" | "error"; message?: string }>(
    { kind: "idle" },
  );
  const [actionLoading, setActionLoading] = useState<null | "resend_email" | "upgrade_kyc">(null);

  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [passkeyCount, setPasskeyCount] = useState<number>(0);

  const [passkeys, setPasskeys] = useState<PasskeysResponse["passkeys"]>([]);
  const [passkeysSupported, setPasskeysSupported] = useState(false);
  const [passkeySheetOpen, setPasskeySheetOpen] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyStatus, setPasskeyStatus] = useState<{ kind: "idle" | "ok" | "error"; message?: string }>({ kind: "idle" });

  const [totpSheetOpen, setTotpSheetOpen] = useState(false);
  const [totpStep, setTotpStep] = useState<"idle" | "setup" | "backup">("idle");
  const [totpSecret, setTotpSecret] = useState<string>("");
  const [totpUri, setTotpUri] = useState<string>("");
  const [totpCode, setTotpCode] = useState<string>("");
  const [totpDisableCode, setTotpDisableCode] = useState<string>("");
  const [totpBackupCodes, setTotpBackupCodes] = useState<string[]>([]);
  const [totpBusy, setTotpBusy] = useState<null | "setup" | "enable" | "disable">(null);
  const [totpStatus, setTotpStatus] = useState<{ kind: "idle" | "ok" | "error"; message?: string }>({ kind: "idle" });

  const [passwordSheetOpen, setPasswordSheetOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState<string>("");
  const [pwNew, setPwNew] = useState<string>("");
  const [pwConfirm, setPwConfirm] = useState<string>("");
  const [pwTotpCode, setPwTotpCode] = useState<string>("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwStatus, setPwStatus] = useState<{ kind: "idle" | "ok" | "error"; message?: string }>({ kind: "idle" });

  const [logoutAllBusy, setLogoutAllBusy] = useState(false);
  const [logoutAllStatus, setLogoutAllStatus] = useState<{ kind: "idle" | "ok" | "error"; message?: string }>({ kind: "idle" });

  const [kyc, setKyc] = useState<KycResponse | null>(null);
  const [kycError, setKycError] = useState<string | null>(null);

  const [kycSheetOpen, setKycSheetOpen] = useState(false);
  const [docType, setDocType] = useState<KycDocType>("passport");
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [kycSubmitLoading, setKycSubmitLoading] = useState(false);
  const [kycSubmitStatus, setKycSubmitStatus] = useState<{ kind: "idle" | "ok" | "error"; message?: string }>(
    { kind: "idle" },
  );

  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs | null>(null);
  const [notifPrefsKnown, setNotifPrefsKnown] = useState<string[]>([]);
  const [notifSchedule, setNotifSchedule] = useState<NotificationSchedule | null>(null);
  const [notifError, setNotifError] = useState<string | null>(null);

  const [prefsSheetOpen, setPrefsSheetOpen] = useState(false);
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
  const [notifSaving, setNotifSaving] = useState<null | "prefs" | "schedule">(null);
  const [notifStatus, setNotifStatus] = useState<{ kind: "idle" | "ok" | "error"; message?: string }>({ kind: "idle" });

  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const load = async () => {
    setError(null);
    setKycError(null);
    setNotifError(null);
    try {
      const profileRes = await fetch("/api/account/profile", { cache: "no-store", credentials: "include" });
      if (!profileRes.ok) {
        setAuthed(false);
        setProfile(null);
        setPasskeyCount(0);
        setKyc(null);
        setNotifPrefs(null);
        setNotifSchedule(null);
        return;
      }
      const profileJson = (await profileRes.json().catch(() => null)) as ProfileResponse | null;
      if (!profileJson?.user?.id) {
        setAuthed(false);
        setProfile(null);
        setPasskeyCount(0);
        return;
      }
      setAuthed(true);
      setProfile(profileJson.user);

      // Clear transient action messages once we have fresh profile state.
      setActionStatus({ kind: "idle" });

      const passkeysRes = await fetch("/api/account/passkeys", { cache: "no-store", credentials: "include" }).catch(() => null as any);
      if (passkeysRes && passkeysRes.ok) {
        const passkeysJson = (await passkeysRes.json().catch(() => null)) as PasskeysResponse | null;
        const rows = Array.isArray(passkeysJson?.passkeys) ? passkeysJson!.passkeys : [];
        setPasskeys(rows);
        setPasskeyCount(rows.length);
      } else {
        setPasskeys([]);
        setPasskeyCount(0);
      }

      const kycRes = await fetch("/api/account/kyc", { cache: "no-store", credentials: "include" }).catch(() => null as any);
      if (kycRes && kycRes.ok) {
        const kycJson = (await kycRes.json().catch(() => null)) as KycResponse | null;
        if (kycJson && typeof kycJson.kyc_level === "string" && Array.isArray(kycJson.submissions)) {
          setKyc(kycJson);
        } else {
          setKyc(null);
        }
      } else {
        setKyc(null);
        if (kycRes && typeof kycRes.status === "number") setKycError(`KYC unavailable (HTTP ${kycRes.status}).`);
      }

      const [prefsRes, schedRes] = await Promise.all([
        fetch("/api/account/notification-preferences", { cache: "no-store", credentials: "include" }).catch(() => null as any),
        fetch("/api/account/notification-schedule", { cache: "no-store", credentials: "include" }).catch(() => null as any),
      ]);

      if (prefsRes && prefsRes.ok) {
        const prefsJson = (await prefsRes.json().catch(() => null)) as NotificationPrefsResponse | null;
        if (prefsJson && prefsJson.prefs && typeof prefsJson.prefs === "object") {
          setNotifPrefs(prefsJson.prefs);
          setNotifPrefsKnown(Array.isArray(prefsJson.known_types) ? prefsJson.known_types.map(String) : []);
        } else {
          setNotifPrefs(null);
        }
      } else {
        setNotifPrefs(null);
        if (prefsRes && typeof prefsRes.status === "number") setNotifError(`Notifications unavailable (HTTP ${prefsRes.status}).`);
      }

      if (schedRes && schedRes.ok) {
        const schedJson = (await schedRes.json().catch(() => null)) as NotificationScheduleResponse | null;
        if (schedJson?.schedule) setNotifSchedule(schedJson.schedule);
        else setNotifSchedule(null);
      } else {
        setNotifSchedule(null);
      }

      // Best-effort unread count for the Notifications card.
      const notifRes = await fetch("/api/notifications?limit=1", { cache: "no-store", credentials: "include" }).catch(() => null as any);
      if (notifRes && notifRes.ok) {
        const notifJson = (await notifRes.json().catch(() => null)) as NotificationsResponse | null;
        if (notifJson && typeof notifJson.unread_count === "number") setUnreadCount(notifJson.unread_count);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const loadInbox = async () => {
    setInboxError(null);
    setInboxLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=50", { cache: "no-store", credentials: "include" });
      const json = (await res.json().catch(() => null)) as NotificationsResponse | null;
      if (!res.ok) {
        const msg = (json as any)?.message || (json as any)?.error;
        throw new Error(typeof msg === "string" && msg.length ? msg : `http_${res.status}`);
      }
      setNotifications(Array.isArray(json?.notifications) ? json!.notifications : []);
      setUnreadCount(typeof json?.unread_count === "number" ? json.unread_count : 0);
    } catch (e) {
      setInboxError(e instanceof Error ? e.message : String(e));
    } finally {
      setInboxLoading(false);
    }
  };

  const markAllRead = async () => {
    setInboxError(null);
    try {
      const csrf = getCsrfToken();
      await fetch("/api/notifications", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({ mark_all_read: true }),
      });
    } finally {
      await loadInbox();
    }
  };

  const markOneRead = async (id: string) => {
    if (!id) return;
    setInboxError(null);
    try {
      const csrf = getCsrfToken();
      await fetch("/api/notifications", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({ ids: [id] }),
      });
    } finally {
      setNotifications((rows) => rows.map((r) => (r.id === id ? { ...r, is_read: true } : r)));
      setUnreadCount((n) => Math.max(0, n - 1));
      void loadInbox();
    }
  };

  const setPref = (type: string, patch: Partial<{ in_app: boolean; email: boolean }>) => {
    setNotifPrefs((prev) => {
      if (!prev) return prev;
      const cur = prev[type] ?? { in_app: true, email: false };
      return { ...prev, [type]: { ...cur, ...patch } };
    });
  };

  const savePrefs = async () => {
    if (!notifPrefs) return;
    setNotifStatus({ kind: "idle" });
    setNotifSaving("prefs");
    try {
      const csrf = getCsrfToken();
      const res = await fetch("/api/account/notification-preferences", {
        method: "PUT",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({ prefs: notifPrefs }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const msg = json?.message || json?.error;
        setNotifStatus({ kind: "error", message: typeof msg === "string" && msg.length ? msg : `Failed (HTTP ${res.status}).` });
        return;
      }
      setNotifStatus({ kind: "ok", message: "Preferences saved." });
      setPrefsSheetOpen(false);
    } catch (e) {
      setNotifStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setNotifSaving(null);
    }
  };

  const saveSchedule = async () => {
    if (!notifSchedule) return;
    setNotifStatus({ kind: "idle" });
    setNotifSaving("schedule");
    try {
      const csrf = getCsrfToken();
      const res = await fetch("/api/account/notification-schedule", {
        method: "PUT",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({
          quiet_enabled: !!notifSchedule.quiet_enabled,
          quiet_start_min: Math.max(0, Math.min(1439, Math.trunc(notifSchedule.quiet_start_min))),
          quiet_end_min: Math.max(0, Math.min(1439, Math.trunc(notifSchedule.quiet_end_min))),
          tz_offset_min: Math.max(-840, Math.min(840, Math.trunc(notifSchedule.tz_offset_min))),
          digest_enabled: !!notifSchedule.digest_enabled,
        }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const msg = json?.message || json?.error;
        setNotifStatus({ kind: "error", message: typeof msg === "string" && msg.length ? msg : `Failed (HTTP ${res.status}).` });
        return;
      }
      setNotifStatus({ kind: "ok", message: "Schedule saved." });
      setScheduleSheetOpen(false);
      await load();
    } catch (e) {
      setNotifStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setNotifSaving(null);
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("file_read_failed"));
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.readAsDataURL(file);
    });
  };

  const submitKycDocuments = async () => {
    setKycSubmitStatus({ kind: "idle" });
    if (!frontFile) {
      setKycSubmitStatus({ kind: "error", message: "Front image is required." });
      return;
    }

    // Keep this conservative: base64 expands size; route enforces 2,000,000 chars.
    const maxBytes = 900_000;
    if (frontFile.size > maxBytes || (backFile && backFile.size > maxBytes) || (selfieFile && selfieFile.size > maxBytes)) {
      setKycSubmitStatus({ kind: "error", message: "Image too large. Use smaller files (≤ 900KB each)." });
      return;
    }

    setKycSubmitLoading(true);
    try {
      const csrf = getCsrfToken();
      const document_front = await readFileAsDataUrl(frontFile);
      const document_back = backFile ? await readFileAsDataUrl(backFile) : undefined;
      const selfie = selfieFile ? await readFileAsDataUrl(selfieFile) : undefined;

      const res = await fetch("/api/account/kyc", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({
          action: "submit_documents",
          document_type: docType,
          document_front,
          document_back,
          selfie,
        }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const msg = json?.details?.message || json?.message || json?.error;
        setKycSubmitStatus({ kind: "error", message: typeof msg === "string" && msg.length ? msg : `Failed (HTTP ${res.status}).` });
        return;
      }

      setKycSubmitStatus({ kind: "ok", message: String(json?.message ?? "Documents submitted") });
      setFrontFile(null);
      setBackFile(null);
      setSelfieFile(null);
      setKycSheetOpen(false);
      await load();
    } catch (e) {
      setKycSubmitStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setKycSubmitLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPasskeysSupported(typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined");
  }, []);

  const refreshPasskeys = async () => {
    try {
      const res = await fetch("/api/account/passkeys", { cache: "no-store", credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as PasskeysResponse | null;
      const rows = Array.isArray(json?.passkeys) ? json!.passkeys : [];
      setPasskeys(rows);
      setPasskeyCount(rows.length);
    } catch {
      // ignore
    }
  };

  const addPasskey = async () => {
    setPasskeyStatus({ kind: "idle" });
    if (!passkeysSupported) {
      setPasskeyStatus({ kind: "error", message: "Passkeys aren’t supported in this browser/device." });
      return;
    }

    const name = (window.prompt("Name this passkey (optional)", "This device") ?? "").trim();

    setPasskeyBusy(true);
    try {
      const csrf = getCsrfToken();
      const optRes = await fetch("/api/account/passkeys/register/options", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify(name ? { name } : {}),
      });
      const optJson = (await optRes.json().catch(() => ({}))) as any;
      if (!optRes.ok) {
        setPasskeyStatus({ kind: "error", message: msgFrom(optJson, "Failed to start passkey registration") });
        return;
      }

      const regOptions = optJson?.options;
      if (!regOptions) {
        setPasskeyStatus({ kind: "error", message: "Invalid passkey registration options" });
        return;
      }

      const attResp = await startRegistration(regOptions as Parameters<typeof startRegistration>[0]);
      const verRes = await fetch("/api/account/passkeys/register/verify", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({ name: name || undefined, response: attResp }),
      });
      const verJson = (await verRes.json().catch(() => ({}))) as any;
      if (!verRes.ok) {
        setPasskeyStatus({ kind: "error", message: msgFrom(verJson, "Passkey verification failed") });
        return;
      }

      setPasskeyStatus({ kind: "ok", message: "Passkey added." });
      await refreshPasskeys();
      await load();
    } catch (e) {
      setPasskeyStatus({ kind: "error", message: e instanceof Error ? e.message : "Passkey registration canceled" });
    } finally {
      setPasskeyBusy(false);
    }
  };

  const confirmPasskey = async () => {
    setPasskeyStatus({ kind: "idle" });
    if (!passkeysSupported) {
      setPasskeyStatus({ kind: "error", message: "Passkeys aren’t supported in this browser/device." });
      return;
    }

    setPasskeyBusy(true);
    try {
      const csrf = getCsrfToken();
      const optRes = await fetch("/api/account/passkeys/authenticate/options", {
        method: "POST",
        credentials: "include",
        headers: csrf ? { "x-csrf-token": csrf } : undefined,
      });
      const optJson = (await optRes.json().catch(() => ({}))) as any;
      if (!optRes.ok) {
        setPasskeyStatus({ kind: "error", message: msgFrom(optJson, "Failed to start passkey confirmation") });
        return;
      }
      const authOptions = optJson?.options;
      if (!authOptions) {
        setPasskeyStatus({ kind: "error", message: "Invalid passkey authentication options" });
        return;
      }

      const asrt = await startAuthentication(authOptions as Parameters<typeof startAuthentication>[0]);
      const verRes = await fetch("/api/account/passkeys/authenticate/verify", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({ response: asrt }),
      });
      const verJson = (await verRes.json().catch(() => ({}))) as any;
      if (!verRes.ok) {
        setPasskeyStatus({ kind: "error", message: msgFrom(verJson, "Passkey verification failed") });
        return;
      }

      setPasskeyStatus({ kind: "ok", message: "Passkey confirmed (valid for a few minutes)." });
      await refreshPasskeys();
      await load();
    } catch (e) {
      setPasskeyStatus({ kind: "error", message: e instanceof Error ? e.message : "Passkey confirmation canceled" });
    } finally {
      setPasskeyBusy(false);
    }
  };

  const totpSetup = async () => {
    setTotpStatus({ kind: "idle" });
    setTotpBusy("setup");
    try {
      const csrf = getCsrfToken();
      const res = await fetch("/api/account/totp/setup", {
        method: "POST",
        credentials: "include",
        headers: csrf ? { "x-csrf-token": csrf } : undefined,
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        setTotpStatus({ kind: "error", message: msgFrom(json, "Setup failed") });
        return;
      }
      setTotpSecret(String(json?.secret ?? ""));
      setTotpUri(String(json?.uri ?? ""));
      setTotpStep("setup");
    } catch (e) {
      setTotpStatus({ kind: "error", message: e instanceof Error ? e.message : "Network error" });
    } finally {
      setTotpBusy(null);
    }
  };

  const totpEnable = async () => {
    setTotpStatus({ kind: "idle" });
    setTotpBusy("enable");
    try {
      const csrf = getCsrfToken();
      const res = await fetch("/api/account/totp/enable", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({ code: totpCode }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        const msg = json?.error === "invalid_totp_code" ? "Invalid code — try again" : msgFrom(json, "Failed");
        setTotpStatus({ kind: "error", message: msg });
        return;
      }
      setTotpBackupCodes(Array.isArray(json?.backup_codes) ? json.backup_codes.map(String) : []);
      setTotpStep("backup");
      setTotpCode("");
      setTotpStatus({ kind: "ok", message: "2FA enabled." });
      await load();
    } catch (e) {
      setTotpStatus({ kind: "error", message: e instanceof Error ? e.message : "Network error" });
    } finally {
      setTotpBusy(null);
    }
  };

  const totpDisable = async () => {
    setTotpStatus({ kind: "idle" });
    setTotpBusy("disable");
    try {
      const csrf = getCsrfToken();
      const res = await fetch("/api/account/totp/disable", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({ code: totpDisableCode }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        const msg = json?.error === "invalid_totp_code" ? "Invalid code" : msgFrom(json, "Failed");
        setTotpStatus({ kind: "error", message: msg });
        return;
      }
      setTotpDisableCode("");
      setTotpSecret("");
      setTotpUri("");
      setTotpBackupCodes([]);
      setTotpStep("idle");
      setTotpStatus({ kind: "ok", message: "2FA disabled." });
      await load();
    } catch (e) {
      setTotpStatus({ kind: "error", message: e instanceof Error ? e.message : "Network error" });
    } finally {
      setTotpBusy(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    const v = String(text || "").trim();
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
    } catch {
      // ignore
    }
  };

  const changePassword = async () => {
    setPwStatus({ kind: "idle" });
    const a = pwNew;
    if (a.length < 8) {
      setPwStatus({ kind: "error", message: "New password must be at least 8 characters." });
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwStatus({ kind: "error", message: "Passwords do not match." });
      return;
    }

    setPwBusy(true);
    try {
      const csrf = getCsrfToken();
      const body: any = { currentPassword: pwCurrent, newPassword: pwNew };
      if (String(pwTotpCode || "").trim().length === 6) body.totp_code = pwTotpCode;
      const res = await fetch("/api/account/password", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        const msg =
          json?.error === "invalid_current_password"
            ? "Current password is incorrect"
            : json?.error === "totp_required"
              ? "Enter your 2FA code"
              : json?.error === "invalid_totp_code"
                ? "Invalid 2FA code"
                : msgFrom(json, "Failed to update password");
        setPwStatus({ kind: "error", message: msg });
        return;
      }
      setPwStatus({ kind: "ok", message: "Password updated." });
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
      setPwTotpCode("");
    } catch (e) {
      setPwStatus({ kind: "error", message: e instanceof Error ? e.message : "Network error" });
    } finally {
      setPwBusy(false);
    }
  };

  const logoutAllDevices = async () => {
    if (logoutAllBusy) return;
    setLogoutAllStatus({ kind: "idle" });
    const ok = window.confirm("Log out all devices? You will be signed out everywhere.");
    if (!ok) return;

    setLogoutAllBusy(true);
    try {
      const csrf = getCsrfToken();
      const res = await fetch("/api/account/sessions/logout-all", {
        method: "POST",
        credentials: "include",
        headers: csrf ? { "x-csrf-token": csrf } : undefined,
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        setLogoutAllStatus({ kind: "error", message: msgFrom(json, "Failed to log out all devices") });
        return;
      }
      setLogoutAllStatus({ kind: "ok", message: "Logged out on all devices." });
      window.location.href = "/login";
    } catch (e) {
      setLogoutAllStatus({ kind: "error", message: e instanceof Error ? e.message : "Network error" });
    } finally {
      setLogoutAllBusy(false);
    }
  };

  const title = useMemo(() => {
    if (!profile) return "Account";
    const email = String(profile.email ?? "").trim();
    if (email) return email;
    return profile.display_name ? String(profile.display_name) : "Account";
  }, [profile]);

  const signOut = async () => {
    try {
      const csrf = getCsrfToken();
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: csrf ? { "x-csrf-token": csrf } : undefined,
      });
    } finally {
      window.location.href = "/v2";
    }
  };

  const resendVerificationEmail = async () => {
    setActionStatus({ kind: "idle" });
    setActionLoading("resend_email");
    try {
      const csrf = getCsrfToken();
      const res = await fetch("/api/account/verify-email", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({ action: "resend" }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const msg = json?.details?.message || json?.message || json?.error;
        setActionStatus({ kind: "error", message: typeof msg === "string" && msg.length ? msg : `Failed (HTTP ${res.status}).` });
        return;
      }
      setActionStatus({ kind: "ok", message: String(json?.message ?? "Verification email sent") });
    } catch (e) {
      setActionStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setActionLoading(null);
    }
  };

  const upgradeKyc = async () => {
    setActionStatus({ kind: "idle" });
    setActionLoading("upgrade_kyc");
    try {
      const csrf = getCsrfToken();
      const res = await fetch("/api/account/kyc", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({ action: "upgrade" }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const msg = json?.details?.message || json?.message || json?.error;
        setActionStatus({ kind: "error", message: typeof msg === "string" && msg.length ? msg : `Failed (HTTP ${res.status}).` });
        return;
      }
      setActionStatus({ kind: "ok", message: `KYC upgraded to ${String(json?.kyc_level ?? "basic")}.` });
      await load();
    } catch (e) {
      setActionStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Account</div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="text-sm text-[var(--v2-muted)]">Security & verification status.</p>
      </header>

      {error ? (
        <V2Card>
          <V2CardHeader title="Account unavailable" subtitle="Try again" />
          <V2CardBody>
            <div className="text-sm text-[var(--v2-muted)]">{error}</div>
            <div className="mt-3">
              <V2Button variant="primary" fullWidth onClick={() => void load()}>
                Retry
              </V2Button>
            </div>
          </V2CardBody>
        </V2Card>
      ) : null}

      <V2Card>
        <V2CardHeader title="Session" subtitle="Signed-in status" />
        <V2CardBody>
          {loading ? (
            <V2Skeleton className="h-14" />
          ) : authed && profile ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {pill(profile.email_verified, "Email verified", "Email unverified")}
                {pill(profile.totp_enabled, "2FA on", "2FA off")}
                {pill(passkeyCount > 0, `Passkeys ${passkeyCount}`, "No passkeys")}
                {pill(profile.kyc_level === "full", "KYC full", `KYC ${profile.kyc_level}`)}
              </div>

              {actionStatus.kind === "ok" ? (
                <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-up-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--v2-up)]">
                  {actionStatus.message}
                </div>
              ) : actionStatus.kind === "error" ? (
                <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-down-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--v2-down)]">
                  {actionStatus.message}
                </div>
              ) : null}

              {!profile.email_verified ? (
                <V2Button
                  variant="primary"
                  fullWidth
                  disabled={actionLoading !== null}
                  onClick={() => void resendVerificationEmail()}
                >
                  {actionLoading === "resend_email" ? "Sending…" : "Resend verification email"}
                </V2Button>
              ) : null}

              {profile.email_verified && profile.kyc_level === "none" ? (
                <V2Button
                  variant="secondary"
                  fullWidth
                  disabled={actionLoading !== null}
                  onClick={() => void upgradeKyc()}
                >
                  {actionLoading === "upgrade_kyc" ? "Upgrading…" : "Upgrade KYC to Basic"}
                </V2Button>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <V2Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    setPasskeyStatus({ kind: "idle" });
                    setPasskeySheetOpen(true);
                    void refreshPasskeys();
                  }}
                >
                  Passkeys
                </V2Button>
                <V2Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    setTotpStatus({ kind: "idle" });
                    setTotpStep("idle");
                    setTotpSecret("");
                    setTotpUri("");
                    setTotpBackupCodes([]);
                    setTotpCode("");
                    setTotpDisableCode("");
                    setTotpSheetOpen(true);
                  }}
                >
                  2FA (TOTP)
                </V2Button>
                <V2Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    setPwStatus({ kind: "idle" });
                    setPasswordSheetOpen(true);
                  }}
                >
                  Change password
                </V2Button>
                <V2Button variant="secondary" fullWidth disabled={logoutAllBusy} onClick={() => void logoutAllDevices()}>
                  {logoutAllBusy ? "Working…" : "Log out all"}
                </V2Button>
              </div>

              {logoutAllStatus.kind === "error" ? (
                <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-down-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--v2-down)]">
                  {logoutAllStatus.message}
                </div>
              ) : null}

              <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3 shadow-[var(--v2-shadow-sm)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[var(--v2-text)]">Verification</div>
                    <div className="mt-1 text-[12px] text-[var(--v2-muted)]">
                      KYC: <span className="font-semibold text-[var(--v2-text)]">{String(kyc?.kyc_level ?? profile.kyc_level)}</span>
                      {kyc?.submissions?.[0]?.status ? (
                        <span className="ml-2">• latest {String(kyc.submissions[0].status).replaceAll("_", " ")}</span>
                      ) : null}
                    </div>
                    {kycError ? <div className="mt-1 text-[12px] text-[var(--v2-muted)]">{kycError}</div> : null}
                    {kyc?.submissions?.[0]?.rejection_reason ? (
                      <div className="mt-1 text-[12px] font-semibold text-[var(--v2-down)]">
                        Rejected: {kyc.submissions[0].rejection_reason}
                      </div>
                    ) : null}
                  </div>

                  {profile.email_verified && String(kyc?.kyc_level ?? profile.kyc_level) === "basic" ? (
                    <div className="shrink-0">
                      <V2Button variant="secondary" onClick={() => { setKycSubmitStatus({ kind: "idle" }); setKycSheetOpen(true); }}>
                        Submit docs
                      </V2Button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3 shadow-[var(--v2-shadow-sm)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[var(--v2-text)]">Notifications</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {togglePill(!!notifSchedule?.quiet_enabled, "Quiet hours on", "Quiet hours off")}
                      {togglePill(!!notifSchedule?.digest_enabled, "Digest on", "Digest off")}
                      {togglePill(
                        Object.values(notifPrefs ?? {}).some((p) => p.email),
                        "Email enabled",
                        "Email off",
                      )}
                      {unreadCount > 0 ? (
                        <span className="inline-flex items-center rounded-full border border-[var(--v2-border)] bg-[var(--v2-warn-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-warn)]">
                          {unreadCount} unread
                        </span>
                      ) : null}
                    </div>
                    {notifError ? <div className="mt-1 text-[12px] text-[var(--v2-muted)]">{notifError}</div> : null}
                  </div>
                  <div className="shrink-0 grid gap-2">
                    <V2Button variant="secondary" size="sm" onClick={() => { setInboxError(null); setInboxOpen(true); void loadInbox(); }}>
                      Inbox
                    </V2Button>
                    <V2Button variant="secondary" size="sm" onClick={() => { setNotifStatus({ kind: "idle" }); setScheduleSheetOpen(true); }}>
                      Schedule
                    </V2Button>
                    <V2Button variant="secondary" size="sm" onClick={() => { setNotifStatus({ kind: "idle" }); setPrefsSheetOpen(true); }}>
                      Preferences
                    </V2Button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3 shadow-[var(--v2-shadow-sm)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[var(--v2-text)]">P2P</div>
                    <div className="mt-1 text-[12px] text-[var(--v2-muted)]">Escrow-backed marketplace and order chat.</div>
                  </div>
                  <div className="shrink-0 grid gap-2">
                    <Link href="/v2/p2p" className={v2ButtonClassName({ variant: "secondary", size: "sm" })}>
                      Marketplace
                    </Link>
                    <Link href="/v2/p2p/orders" className={v2ButtonClassName({ variant: "secondary", size: "sm" })}>
                      My orders
                    </Link>
                  </div>
                </div>
              </div>

              <V2Button variant="primary" fullWidth onClick={() => void signOut()}>
                Sign out
              </V2Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-[var(--v2-muted)]">You’re not signed in.</div>
              <Link href="/login" className={v2ButtonClassName({ variant: "primary", fullWidth: true })}>
                Sign in
              </Link>
            </div>
          )}
        </V2CardBody>
      </V2Card>

      <V2Sheet open={passkeySheetOpen} title="Passkeys" onClose={() => setPasskeySheetOpen(false)}>
        <div className="grid gap-3">
          <div className="text-[12px] text-[var(--v2-muted)]">Use a device passkey (biometrics / screen lock) for stronger security.</div>

          {passkeyStatus.kind === "error" ? (
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-down-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--v2-down)]">
              {passkeyStatus.message}
            </div>
          ) : passkeyStatus.kind === "ok" ? (
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-up-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--v2-up)]">
              {passkeyStatus.message}
            </div>
          ) : null}

          {!passkeysSupported ? (
            <div className="text-[13px] text-[var(--v2-muted)]">Passkeys aren’t available in this browser/device.</div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <V2Button variant="primary" fullWidth disabled={passkeyBusy} onClick={() => void addPasskey()}>
                {passkeyBusy ? "Working…" : "Add passkey"}
              </V2Button>
              <V2Button
                variant="secondary"
                fullWidth
                disabled={passkeyBusy || passkeys.length === 0}
                onClick={() => void confirmPasskey()}
              >
                Confirm
              </V2Button>
            </div>
          )}

          <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3 shadow-[var(--v2-shadow-sm)]">
            <div className="text-[12px] font-semibold text-[var(--v2-text)]">Enrolled passkeys</div>
            {passkeys.length === 0 ? (
              <div className="mt-1 text-[12px] text-[var(--v2-muted)]">No passkeys yet.</div>
            ) : (
              <div className="mt-2 grid gap-2">
                {passkeys.map((pk) => (
                  <div key={pk.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-[var(--v2-text)]">{pk.name ?? "Passkey"}</div>
                      <div className="mt-0.5 text-[11px] text-[var(--v2-muted)]">Added {new Date(pk.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className="shrink-0 text-[11px] text-[var(--v2-muted)]">
                      {pk.last_used_at ? `Last used ${new Date(pk.last_used_at).toLocaleDateString()}` : "Not used yet"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </V2Sheet>

      <V2Sheet open={totpSheetOpen} title="Two-factor authentication (2FA)" onClose={() => setTotpSheetOpen(false)}>
        <div className="grid gap-3">
          <div className="text-[12px] text-[var(--v2-muted)]">Protect your account with a 6‑digit code from an authenticator app.</div>

          {totpStatus.kind === "error" ? (
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-down-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--v2-down)]">
              {totpStatus.message}
            </div>
          ) : totpStatus.kind === "ok" ? (
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-up-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--v2-up)]">
              {totpStatus.message}
            </div>
          ) : null}

          {profile?.totp_enabled && totpStep !== "backup" ? (
            <div className="grid gap-2">
              <div className="text-[13px] font-semibold text-[var(--v2-text)]">2FA is enabled</div>
              <div className="grid grid-cols-2 gap-2">
                <V2Input
                  value={totpDisableCode}
                  onChange={(e) => setTotpDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  className="font-mono tracking-[0.2em]"
                  autoComplete="one-time-code"
                />
                <V2Button
                  variant="secondary"
                  fullWidth
                  disabled={totpBusy !== null || totpDisableCode.length !== 6}
                  onClick={() => void totpDisable()}
                >
                  {totpBusy === "disable" ? "Disabling…" : "Disable"}
                </V2Button>
              </div>
              <div className="text-[11px] text-[var(--v2-muted)]">Enter a current code to disable 2FA.</div>
            </div>
          ) : totpStep === "idle" ? (
            <div className="grid gap-2">
              <div className="text-[13px] font-semibold text-[var(--v2-text)]">2FA is off</div>
              <V2Button variant="primary" fullWidth disabled={totpBusy !== null} onClick={() => void totpSetup()}>
                {totpBusy === "setup" ? "Setting up…" : "Enable 2FA"}
              </V2Button>
            </div>
          ) : totpStep === "setup" ? (
            <div className="grid gap-3">
              <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3 shadow-[var(--v2-shadow-sm)]">
                <div className="text-[12px] font-semibold text-[var(--v2-text)]">Setup key</div>
                <div className="mt-1 break-all rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 font-mono text-[12px] text-[var(--v2-text)]">
                  {totpSecret || "—"}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <V2Button variant="secondary" fullWidth onClick={() => void copyToClipboard(totpSecret)}>
                    Copy key
                  </V2Button>
                  <V2Button variant="secondary" fullWidth onClick={() => void copyToClipboard(totpUri)}>
                    Copy URI
                  </V2Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <V2Input
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  className="font-mono tracking-[0.2em]"
                  autoComplete="one-time-code"
                />
                <V2Button
                  variant="primary"
                  fullWidth
                  disabled={totpBusy !== null || totpCode.length !== 6}
                  onClick={() => void totpEnable()}
                >
                  {totpBusy === "enable" ? "Verifying…" : "Verify"}
                </V2Button>
              </div>

              <V2Button
                variant="secondary"
                fullWidth
                disabled={totpBusy !== null}
                onClick={() => {
                  setTotpStep("idle");
                  setTotpStatus({ kind: "idle" });
                }}
              >
                Cancel
              </V2Button>
            </div>
          ) : totpStep === "backup" ? (
            <div className="grid gap-3">
              <div className="text-[13px] font-semibold text-[var(--v2-text)]">Save your backup codes</div>
              <div className="text-[12px] text-[var(--v2-muted)]">Store these safely. Each code can be used once if you lose your authenticator.</div>
              <div className="grid grid-cols-2 gap-2">
                {totpBackupCodes.slice(0, 12).map((c, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-2 text-center font-mono text-[12px] text-[var(--v2-text)]"
                  >
                    {c}
                  </div>
                ))}
              </div>
              <V2Button
                variant="primary"
                fullWidth
                onClick={() => {
                  setTotpStep("idle");
                  setTotpSheetOpen(false);
                }}
              >
                I’ve saved them
              </V2Button>
            </div>
          ) : null}
        </div>
      </V2Sheet>

      <V2Sheet open={passwordSheetOpen} title="Change password" onClose={() => setPasswordSheetOpen(false)}>
        <div className="grid gap-3">
          {pwStatus.kind === "error" ? (
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-down-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--v2-down)]">
              {pwStatus.message}
            </div>
          ) : pwStatus.kind === "ok" ? (
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-up-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--v2-up)]">
              {pwStatus.message}
            </div>
          ) : null}

          <label className="grid gap-1">
            <div className="text-[12px] font-semibold text-[var(--v2-text)]">Current password</div>
            <V2Input type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} autoComplete="current-password" />
          </label>

          <label className="grid gap-1">
            <div className="text-[12px] font-semibold text-[var(--v2-text)]">New password</div>
            <V2Input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} autoComplete="new-password" />
          </label>

          <label className="grid gap-1">
            <div className="text-[12px] font-semibold text-[var(--v2-text)]">Confirm new password</div>
            <V2Input type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} autoComplete="new-password" />
          </label>

          {profile?.totp_enabled ? (
            <label className="grid gap-1">
              <div className="text-[12px] font-semibold text-[var(--v2-text)]">2FA code</div>
              <V2Input
                value={pwTotpCode}
                onChange={(e) => setPwTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                className="font-mono tracking-[0.2em]"
                autoComplete="one-time-code"
              />
            </label>
          ) : null}

          <V2Button
            variant="primary"
            fullWidth
            disabled={pwBusy || !pwCurrent || !pwNew || !pwConfirm}
            onClick={() => void changePassword()}
          >
            {pwBusy ? "Updating…" : "Update password"}
          </V2Button>
        </div>
      </V2Sheet>

      <V2Sheet
        open={kycSheetOpen}
        title="Submit KYC documents"
        onClose={() => {
          setKycSheetOpen(false);
        }}
      >
        <div className="grid gap-3">
          <div className="text-[12px] text-[var(--v2-muted)]">
            Upload clear photos. This sends images to the server for review.
          </div>

          {kycSubmitStatus.kind === "error" ? (
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-down-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--v2-down)]">
              {kycSubmitStatus.message}
            </div>
          ) : kycSubmitStatus.kind === "ok" ? (
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-up-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--v2-up)]">
              {kycSubmitStatus.message}
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-2">
            {([
              { id: "passport", label: "Passport" },
              { id: "national_id", label: "National ID" },
              { id: "drivers_license", label: "Driver" },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setDocType(t.id)}
                className={
                  "h-10 rounded-xl border px-3 text-[13px] font-semibold shadow-[var(--v2-shadow-sm)] " +
                  (docType === t.id
                    ? "border-[var(--v2-border)] bg-[var(--v2-surface-2)] text-[var(--v2-text)]"
                    : "border-[var(--v2-border)] bg-[var(--v2-surface)] text-[var(--v2-muted)] hover:bg-[var(--v2-surface-2)]")
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          <label className="grid gap-1">
            <div className="text-[12px] font-semibold text-[var(--v2-text)]">Front (required)</div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFrontFile(e.target.files?.[0] ?? null)}
              className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[13px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)]"
            />
            {frontFile ? <div className="text-[11px] text-[var(--v2-muted)]">{frontFile.name}</div> : null}
          </label>

          <label className="grid gap-1">
            <div className="text-[12px] font-semibold text-[var(--v2-text)]">Back (optional)</div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setBackFile(e.target.files?.[0] ?? null)}
              className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[13px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)]"
            />
            {backFile ? <div className="text-[11px] text-[var(--v2-muted)]">{backFile.name}</div> : null}
          </label>

          <label className="grid gap-1">
            <div className="text-[12px] font-semibold text-[var(--v2-text)]">Selfie (optional)</div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setSelfieFile(e.target.files?.[0] ?? null)}
              className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[13px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)]"
            />
            {selfieFile ? <div className="text-[11px] text-[var(--v2-muted)]">{selfieFile.name}</div> : null}
          </label>

          <V2Button variant="primary" fullWidth disabled={kycSubmitLoading} onClick={() => void submitKycDocuments()}>
            {kycSubmitLoading ? "Submitting…" : "Submit"}
          </V2Button>

          <div className="text-[11px] text-[var(--v2-muted)]">Tip: Keep each image ≤ 900KB for reliability.</div>
        </div>
      </V2Sheet>

      <V2Sheet open={scheduleSheetOpen} title="Notification schedule" onClose={() => setScheduleSheetOpen(false)}>
        <div className="grid gap-3">
          {notifStatus.kind === "error" ? (
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-down-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--v2-down)]">
              {notifStatus.message}
            </div>
          ) : notifStatus.kind === "ok" ? (
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-up-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--v2-up)]">
              {notifStatus.message}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setNotifSchedule((s) => (s ? { ...s, quiet_enabled: !s.quiet_enabled } : s))}
            className="flex items-center justify-between rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3 text-left shadow-[var(--v2-shadow-sm)]"
          >
            <div>
              <div className="text-[13px] font-semibold text-[var(--v2-text)]">Quiet hours</div>
              <div className="mt-0.5 text-[12px] text-[var(--v2-muted)]">Mute non-critical alerts during set hours.</div>
            </div>
            {togglePill(!!notifSchedule?.quiet_enabled, "On", "Off")}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-1 text-[12px] font-semibold text-[var(--v2-text)]">Start</div>
              <V2Input
                type="time"
                value={minToTime(notifSchedule?.quiet_start_min ?? 22 * 60)}
                onChange={(e) => setNotifSchedule((s) => (s ? { ...s, quiet_start_min: timeToMin(e.target.value) } : s))}
              />
            </div>
            <div>
              <div className="mb-1 text-[12px] font-semibold text-[var(--v2-text)]">End</div>
              <V2Input
                type="time"
                value={minToTime(notifSchedule?.quiet_end_min ?? 8 * 60)}
                onChange={(e) => setNotifSchedule((s) => (s ? { ...s, quiet_end_min: timeToMin(e.target.value) } : s))}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setNotifSchedule((s) => (s ? { ...s, digest_enabled: !s.digest_enabled } : s))}
            className="flex items-center justify-between rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3 text-left shadow-[var(--v2-shadow-sm)]"
          >
            <div>
              <div className="text-[13px] font-semibold text-[var(--v2-text)]">Email digest</div>
              <div className="mt-0.5 text-[12px] text-[var(--v2-muted)]">Periodic summaries (if email channel enabled).</div>
            </div>
            {togglePill(!!notifSchedule?.digest_enabled, "On", "Off")}
          </button>

          <V2Button variant="primary" fullWidth disabled={notifSaving === "schedule" || !notifSchedule} onClick={() => void saveSchedule()}>
            {notifSaving === "schedule" ? "Saving…" : "Save schedule"}
          </V2Button>
        </div>
      </V2Sheet>

      <V2Sheet open={prefsSheetOpen} title="Notification preferences" onClose={() => setPrefsSheetOpen(false)}>
        <div className="grid gap-3">
          {notifStatus.kind === "error" ? (
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-down-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--v2-down)]">
              {notifStatus.message}
            </div>
          ) : notifStatus.kind === "ok" ? (
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-up-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--v2-up)]">
              {notifStatus.message}
            </div>
          ) : null}

          <div className="text-[12px] text-[var(--v2-muted)]">Key alerts (in-app / email). Others keep defaults.</div>

          {([
            "order_filled",
            "order_rejected",
            "deposit_credited",
            "withdrawal_completed",
            "p2p_order_expiring",
            "system",
          ] as const).map((t) => {
            const cur = (notifPrefs ?? {})[t] ?? { in_app: true, email: false };
            return (
              <div key={t} className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3 shadow-[var(--v2-shadow-sm)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[var(--v2-text)]">{prettyType(t)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPref(t, { in_app: !cur.in_app })}
                        className={
                          "h-9 rounded-xl border px-3 text-[12px] font-semibold shadow-[var(--v2-shadow-sm)] " +
                          (cur.in_app
                            ? "border-[var(--v2-border)] bg-[var(--v2-surface-2)] text-[var(--v2-text)]"
                            : "border-[var(--v2-border)] bg-[var(--v2-surface)] text-[var(--v2-muted)] hover:bg-[var(--v2-surface-2)]")
                        }
                      >
                        In-app: {cur.in_app ? "On" : "Off"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPref(t, { email: !cur.email })}
                        className={
                          "h-9 rounded-xl border px-3 text-[12px] font-semibold shadow-[var(--v2-shadow-sm)] " +
                          (cur.email
                            ? "border-[var(--v2-border)] bg-[var(--v2-surface-2)] text-[var(--v2-text)]"
                            : "border-[var(--v2-border)] bg-[var(--v2-surface)] text-[var(--v2-muted)] hover:bg-[var(--v2-surface-2)]")
                        }
                      >
                        Email: {cur.email ? "On" : "Off"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <V2Button variant="primary" fullWidth disabled={notifSaving === "prefs" || !notifPrefs} onClick={() => void savePrefs()}>
            {notifSaving === "prefs" ? "Saving…" : "Save preferences"}
          </V2Button>

          {notifPrefsKnown.length ? (
            <div className="text-[11px] text-[var(--v2-muted)]">Known types: {notifPrefsKnown.length}</div>
          ) : null}
        </div>
      </V2Sheet>

      <V2Sheet open={inboxOpen} title="Notifications" onClose={() => setInboxOpen(false)}>
        <div className="grid gap-3">
          {inboxError ? (
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-down-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--v2-down)]">
              {inboxError}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <V2Button variant="secondary" fullWidth disabled={inboxLoading} onClick={() => void loadInbox()}>
              Refresh
            </V2Button>
            <V2Button variant="primary" fullWidth disabled={inboxLoading || unreadCount === 0} onClick={() => void markAllRead()}>
              Mark all read
            </V2Button>
          </div>

          {inboxLoading ? (
            <V2Skeleton className="h-32 w-full" />
          ) : notifications.length === 0 ? (
            <div className="text-sm text-[var(--v2-muted)]">No notifications.</div>
          ) : (
            <div className="grid gap-2">
              {notifications.slice(0, 50).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    if (!n.is_read) void markOneRead(n.id);
                  }}
                  className={
                    "rounded-2xl border border-[var(--v2-border)] px-3 py-3 text-left shadow-[var(--v2-shadow-sm)] " +
                    (n.is_read ? "bg-[var(--v2-surface)]" : "bg-[color-mix(in_srgb,var(--v2-warn-bg)_55%,var(--v2-surface))]")
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-[var(--v2-text)]">{n.title}</div>
                      <div className="mt-1 text-[12px] text-[var(--v2-muted)]">{n.body}</div>
                      <div className="mt-1 text-[11px] text-[var(--v2-muted)]">
                        {prettyType(n.type)} • {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                      </div>
                    </div>
                    {!n.is_read ? (
                      <span className="mt-0.5 inline-flex h-2 w-2 rounded-full bg-[var(--v2-warn)]" aria-label="Unread" />
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </V2Sheet>
    </main>
  );
}
