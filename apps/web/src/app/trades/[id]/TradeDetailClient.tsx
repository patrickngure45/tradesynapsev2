"use client";

import { useEffect, useMemo, useState } from "react";

import { computeEvidenceCompleteness } from "@/lib/evidence/completeness";
import { ApiError, fetchJsonOrThrow } from "@/lib/api/client";
import { ApiErrorBanner, type ClientApiError } from "@/components/ApiErrorBanner";
import { canTransitionTrade, type TradeStatus } from "@/lib/state/trade";
import {
  clearSessionCookie,
  createSessionCookie,
  fetchWhoAmI,
} from "@/lib/auth/clientSession";
import {
  persistActingUserIdPreference,
  readActingUserIdPreference,
} from "@/lib/state/actingUser";
import { copyToClipboard } from "@/lib/ui/copyToClipboard";
import { Toast, type ToastKind } from "@/components/Toast";

type TradeDetail = {
  id: string;
  buyer_user_id: string;
  seller_user_id: string;
  fiat_currency: string;
  crypto_asset: string;
  fiat_amount: string;
  crypto_amount: string;
  price: string;
  status: string;
  reference_market_snapshot_id: string | null;
  fair_price_mid: string | null;
  fair_price_lower: string | null;
  fair_price_upper: string | null;
  fair_band_pct: string | null;
  fair_price_basis: string | null;
  price_deviation_pct: string | null;
  created_at: string;
};

type Transition = {
  id: string;
  from_status: string | null;
  to_status: string;
  actor_user_id: string | null;
  actor_type: string;
  reason_code: string | null;
  created_at: string;
};

type EvidenceObject = {
  id: string;
  submitted_by_user_id: string;
  type: string;
  storage_uri: string;
  sha256: string;
  metadata_json: unknown;
  created_at: string;
};

type RiskAssessment = {
  id: string;
  score: number;
  version: string;
  factors_json: unknown;
  recommended_action: string;
  market_snapshot_id: string | null;
  created_at: string;
} | null;

type Dispute = {
  id: string;
  trade_id: string;
  opened_by_user_id: string;
  reason_code: string;
  status: string;
  opened_at: string;
  resolved_at: string | null;
} | null;

type DisputeDecision = {
  id: string;
  dispute_id: string;
  decision: string;
  rationale: string | null;
  decided_by: string;
  created_at: string;
};

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

export function TradeDetailClient({ tradeId }: { tradeId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ClientApiError | null>(null);

  const [authMode, setAuthMode] = useState<"header" | "session">("session");
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionBootstrapKey, setSessionBootstrapKey] = useState<string>("");
  const [sessionLoading, setSessionLoading] = useState(false);

  // Legacy ProofPack auth: buyer is default acting user. Exchange uses session auth instead.
  const [actingUserId, setActingUserId] = useState<string>("");
  const [actingUserInitialized, setActingUserInitialized] = useState(false);

  const [trade, setTrade] = useState<TradeDetail | null>(null);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [evidence, setEvidence] = useState<EvidenceObject[]>([]);
  const [risk, setRisk] = useState<RiskAssessment>(null);
  const [dispute, setDispute] = useState<Dispute>(null);
  const [disputeDecisions, setDisputeDecisions] = useState<DisputeDecision[]>([]);

  const evidenceCompleteness = useMemo(() => computeEvidenceCompleteness(evidence), [evidence]);

  const [uploadType, setUploadType] = useState<
    "receipt" | "screenshot" | "bank_sms" | "chat_export" | "other"
  >("receipt");
  const [submittedBy, setSubmittedBy] = useState<string>("");
  const [metadataJson, setMetadataJson] = useState<string>("{}");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [disputeOpenedBy, setDisputeOpenedBy] = useState<string>("");
  const [disputeReason, setDisputeReason] = useState<
    "non_payment" | "chargeback" | "phishing" | "other"
  >("non_payment");
  const [openingDispute, setOpeningDispute] = useState(false);

  const [decisionBy, setDecisionBy] = useState<string>("reviewer@local");
  const [reviewerKey, setReviewerKey] = useState<string>("");
  const [decisionType, setDecisionType] = useState<
    "release_to_buyer" | "refund_buyer" | "release_to_seller" | "cancel_trade"
  >("release_to_buyer");
  const [decisionRationale, setDecisionRationale] = useState<string>("");
  const [submittingDecision, setSubmittingDecision] = useState(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<ToastKind>("info");

  const [transitioning, setTransitioning] = useState(false);

  const actingRole = useMemo(() => {
    if (!trade || !actingUserId) return null;
    if (actingUserId === trade.buyer_user_id) return "buyer" as const;
    if (actingUserId === trade.seller_user_id) return "seller" as const;
    return null;
  }, [trade, actingUserId]);

  const lifecycleTitle = (to: TradeStatus, opts?: { role?: "buyer" | "seller" }) => {
    if (transitioning) return "Working…";
    if (!trade) return "";
    if (!actingUserId) return "Select an acting user.";

    if (!canTransitionTrade(trade.status, to)) {
      return `Not allowed from status: ${trade.status}`;
    }
    if (opts?.role === "buyer" && actingUserId !== trade.buyer_user_id) {
      return "Buyer only.";
    }
    if (opts?.role === "seller" && actingUserId !== trade.seller_user_id) {
      return "Seller only.";
    }
    if (to === "canceled" && trade.status === "disputed") {
      return "Use reviewer decision to cancel disputed trades.";
    }
    return "";
  };

  const proofPackHref = useMemo(() => {
    const base = `/api/trades/${tradeId}/proof-pack`;
    const scoped = authMode === "session" ? sessionUserId ?? actingUserId : actingUserId;
    return scoped ? `${base}?user_id=${encodeURIComponent(scoped)}` : base;
  }, [tradeId, actingUserId, authMode, sessionUserId]);
  const evidenceUploadHref = useMemo(
    () => `/api/trades/${tradeId}/evidence/upload`,
    [tradeId]
  );
  const disputeHref = useMemo(() => `/api/trades/${tradeId}/dispute`, [tradeId]);
  const disputeDecisionHref = useMemo(
    () => `/api/trades/${tradeId}/dispute/decision`,
    [tradeId]
  );

  async function refreshSession() {
    try {
      const me = await fetchWhoAmI();
      setSessionUserId(me.user_id);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === "missing_x_user_id") {
          setSessionUserId(null);
          return;
        }
      }
      setSessionUserId(null);
    }
  }

  async function signInAs(userId: string): Promise<boolean> {
    if (!userId) return false;

    setSessionLoading(true);
    setError(null);
    try {
      await createSessionCookie({
        userId,
        bootstrapKey: sessionBootstrapKey ? sessionBootstrapKey : undefined,
      });
      await refreshSession();
      setToastKind("success");
      setToastMessage("Session cookie set.");
      return true;
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, details: e.details });
      } else {
        setError({ code: e instanceof Error ? e.message : "session_failed" });
      }
      return false;
    } finally {
      setSessionLoading(false);
    }
  }

  async function signOut() {
    setSessionLoading(true);
    setError(null);
    try {
      await clearSessionCookie();
      await refreshSession();
      setToastKind("success");
      setToastMessage("Signed out.");
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, details: e.details });
      } else {
        setError({ code: e instanceof Error ? e.message : "signout_failed" });
      }
    } finally {
      setSessionLoading(false);
    }
  }

  async function refreshAll() {
    setLoading(true);
    setError(null);

    try {
      const headers: HeadersInit =
        authMode === "header" && actingUserId ? { "x-user-id": actingUserId } : {};

      const [tradeJson, evidenceJson, riskJson, disputeJson] = await Promise.all([
        fetchJsonOrThrow<{ trade?: TradeDetail; transitions?: Transition[] }>(
          `/api/trades/${tradeId}`,
          { cache: "no-store", headers }
        ),
        fetchJsonOrThrow<{ evidence?: EvidenceObject[] }>(
          `/api/trades/${tradeId}/evidence`,
          { cache: "no-store", headers }
        ),
        fetchJsonOrThrow<{ risk_assessment?: RiskAssessment }>(
          `/api/trades/${tradeId}/risk`,
          { cache: "no-store", headers }
        ),
        fetchJsonOrThrow<{ dispute?: Dispute; decisions?: DisputeDecision[] }>(
          disputeHref,
          { cache: "no-store", headers }
        ),
      ]);

      setTrade(tradeJson.trade ?? null);
      setTransitions(tradeJson.transitions ?? []);
      setEvidence(evidenceJson.evidence ?? []);
      setRisk(riskJson.risk_assessment ?? null);
      setDispute(disputeJson.dispute ?? null);
      setDisputeDecisions(disputeJson.decisions ?? []);

      const defaultSubmittedBy = tradeJson.trade?.buyer_user_id ?? "";
      setSubmittedBy((prev) => (prev ? prev : defaultSubmittedBy));

      const defaultDisputeOpenedBy = tradeJson.trade?.buyer_user_id ?? "";
      setDisputeOpenedBy((prev) => (prev ? prev : defaultDisputeOpenedBy));

      const defaultActing = sessionUserId ?? tradeJson.trade?.buyer_user_id ?? "";
      setActingUserId((prev) => (prev ? prev : defaultActing));
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, details: e.details });
      } else {
        setError({ code: e instanceof Error ? e.message : "load_failed" });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const preferred = readActingUserIdPreference();
    if (preferred) {
      setActingUserId((prev) => (prev ? prev : preferred));
    }
    void refreshSession();
    setActingUserInitialized(true);
  }, [tradeId]);

  useEffect(() => {
    if (authMode !== "session") return;
    if (!actingUserId) return;
    if (sessionUserId === actingUserId) return;
    if (sessionLoading) return;

    const isProd = process.env.NODE_ENV === "production";
    if (isProd && !sessionBootstrapKey) return;

    void signInAs(actingUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMode]);

  useEffect(() => {
    if (!actingUserId) return;
    persistActingUserIdPreference(actingUserId);
  }, [actingUserId]);

  useEffect(() => {
    if (!actingUserInitialized) return;
    if (authMode === "header" && !actingUserId && process.env.NODE_ENV === "production") {
      setLoading(false);
      setError({ code: "missing_x_user_id" });
      return;
    }
    if (authMode === "session" && !sessionUserId && process.env.NODE_ENV === "production") {
      setLoading(false);
      setError({ code: "missing_x_user_id" });
      return;
    }
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeId, actingUserId, actingUserInitialized, authMode, sessionUserId]);

  async function runRiskAssessment() {
    setError(null);
    try {
      if (authMode === "session" && sessionUserId && actingUserId && sessionUserId !== actingUserId) {
        setError({ code: "session_user_mismatch" });
        return;
      }

      await fetchJsonOrThrow(`/api/trades/${tradeId}/risk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authMode === "header" && actingUserId ? { "x-user-id": actingUserId } : {}),
        },
        body: JSON.stringify({ version: "v0" }),
      });
      await refreshAll();
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, details: e.details });
      } else {
        setError({ code: e instanceof Error ? e.message : "risk_failed" });
      }
    }
  }

  async function uploadEvidence() {
    if (!file) {
      setError({ code: "missing_file" });
      return;
    }
    if (!submittedBy) {
      setError({ code: "missing_submitted_by_user_id" });
      return;
    }

    setUploading(true);
    setError(null);

    try {
      if (authMode === "session" && sessionUserId && submittedBy && sessionUserId !== submittedBy) {
        setError({ code: "session_user_mismatch" });
        return;
      }

      const form = new FormData();
      form.set("submitted_by_user_id", submittedBy);
      form.set("type", uploadType);
      form.set("metadata_json", metadataJson);
      form.set("file", file);

      const init: RequestInit = { method: "POST", body: form };
      if (authMode === "header" && submittedBy) {
        init.headers = { "x-user-id": submittedBy };
      }

      await fetchJsonOrThrow(evidenceUploadHref, init);

      setFile(null);
      await refreshAll();
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, details: e.details });
      } else {
        setError({ code: e instanceof Error ? e.message : "upload_failed" });
      }
    } finally {
      setUploading(false);
    }
  }

  async function openDispute() {
    if (!disputeOpenedBy) {
      setError({ code: "missing_opened_by_user_id" });
      return;
    }

    setOpeningDispute(true);
    setError(null);

    try {
      if (authMode === "session" && sessionUserId && disputeOpenedBy && sessionUserId !== disputeOpenedBy) {
        setError({ code: "session_user_mismatch" });
        return;
      }

      await fetchJsonOrThrow(disputeHref, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authMode === "header" ? { "x-user-id": disputeOpenedBy } : {}),
        },
        body: JSON.stringify({
          opened_by_user_id: disputeOpenedBy,
          reason_code: disputeReason,
        }),
      });
      await refreshAll();
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, details: e.details });
      } else {
        setError({ code: e instanceof Error ? e.message : "open_dispute_failed" });
      }
    } finally {
      setOpeningDispute(false);
    }
  }

  async function submitDecision() {
    if (!decisionBy) {
      setError({ code: "missing_decided_by" });
      return;
    }

    setSubmittingDecision(true);
    setError(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (reviewerKey) headers["x-reviewer-key"] = reviewerKey;

      await fetchJsonOrThrow(disputeDecisionHref, {
        method: "POST",
        headers,
        body: JSON.stringify({
          decision: decisionType,
          decided_by: decisionBy,
          rationale: decisionRationale ? decisionRationale : undefined,
        }),
      });

      setDecisionRationale("");
      await refreshAll();
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, details: e.details });
      } else {
        setError({ code: e instanceof Error ? e.message : "submit_decision_failed" });
      }
    } finally {
      setSubmittingDecision(false);
    }
  }

  async function transitionTrade(next: TradeStatus) {
    setTransitioning(true);
    setError(null);

    try {
      const segment: Record<TradeStatus, string> = {
        created: "",
        awaiting_payment: "awaiting-payment",
        paid_marked: "paid-marked",
        released: "released",
        disputed: "",
        resolved: "resolved",
        canceled: "canceled",
      };

      const path = segment[next];
      if (!path) {
        setError({ code: "trade_transition_not_allowed" });
        return;
      }

      const init: RequestInit = { method: "POST" };
      if (authMode === "header" && actingUserId) {
        init.headers = { "x-user-id": actingUserId };
      }

      await fetchJsonOrThrow(`/api/trades/${tradeId}/status/${path}`, init);

      setToastKind("success");
      setToastMessage(`Trade moved to ${next}.`);
      await refreshAll();
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, details: e.details });
      } else {
        setError({ code: e instanceof Error ? e.message : "transition_failed" });
      }
    } finally {
      setTransitioning(false);
    }
  }

  if (loading) {
    return <div className="mt-6 text-sm text-zinc-500">Loading…</div>;
  }

  if (error) {
    return <ApiErrorBanner error={error} className="mt-6" onRetry={() => void refreshAll()} />;
  }

  if (!trade) {
    return <div className="mt-6 text-sm text-zinc-500">Not found.</div>;
  }

  return (
    <div className="mt-6 grid gap-6">
      <Toast
        message={toastMessage}
        kind={toastKind}
        onDone={() => setToastMessage(null)}
      />
      <section className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">Viewer</h2>

        <div className="mt-3 grid gap-2 text-sm">
          <div className="text-zinc-500">
            Auth: use a session cookie (recommended) or send <span className="font-mono">x-user-id</span>.
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <span className="text-zinc-500">Auth mode</span>
              <select
                className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-xs dark:border-zinc-800"
                value={authMode}
                onChange={(e) => {
                  const next = e.target.value as typeof authMode;
                  setAuthMode(next);

                  if (next !== "session") return;

                  if (!actingUserId) return;
                  if (sessionUserId === actingUserId) return;

                  const isProd = process.env.NODE_ENV === "production";
                  if (isProd && !sessionBootstrapKey) return;

                  void signInAs(actingUserId);
                }}
              >
                <option value="session">session cookie</option>
                <option value="header">x-user-id header</option>
              </select>
            </label>

            {authMode === "session" ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                <span className="text-zinc-500">Session</span>
                <span className="font-mono">
                  {sessionUserId ? `${sessionUserId.slice(0, 8)}…` : "(none)"}
                </span>
                <button
                  type="button"
                  className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                  disabled={!actingUserId || sessionLoading}
                  onClick={() => void signInAs(actingUserId)}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                  disabled={sessionLoading}
                  onClick={() => void signOut()}
                >
                  Sign out
                </button>
                <details>
                  <summary className="cursor-pointer text-[11px] text-zinc-500">prod bootstrap</summary>
                  <div className="mt-2 grid gap-1">
                    <label className="grid gap-1">
                      <span className="text-[11px] text-zinc-500">x-session-bootstrap-key</span>
                      <input
                        className="rounded border border-zinc-200 bg-transparent px-2 py-1 font-mono text-xs dark:border-zinc-800"
                        value={sessionBootstrapKey}
                        type="password"
                        placeholder="(only needed in production)"
                        onChange={(e) => setSessionBootstrapKey(e.target.value)}
                      />
                    </label>
                  </div>
                </details>
              </div>
            ) : (
              <div className="text-xs text-zinc-500">Requests send x-user-id.</div>
            )}
          </div>

          <label className="grid gap-1 text-sm">
            <span className="text-zinc-500">Acting user</span>
            <select
              className="rounded border border-zinc-200 bg-transparent px-2 py-2 dark:border-zinc-800"
              value={actingUserId}
              onChange={(e) => {
                const next = e.target.value;
                if (authMode !== "session") {
                  setActingUserId(next);
                  return;
                }

                const prev = actingUserId;
                setActingUserId(next);

                if (sessionUserId === next) return;

                const isProd = process.env.NODE_ENV === "production";
                if (isProd && !sessionBootstrapKey) return;

                void (async () => {
                  const ok = await signInAs(next);
                  if (!ok) setActingUserId(prev);
                })();
              }}
            >
              <option value={trade.buyer_user_id}>buyer {trade.buyer_user_id.slice(0, 8)}…</option>
              <option value={trade.seller_user_id}>seller {trade.seller_user_id.slice(0, 8)}…</option>
            </select>
          </label>
        </div>
      </section>

      <section className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Trade</h2>
          <div className="flex items-center gap-3">
            <a className="underline" href={proofPackHref}>
              Download Proof Pack
            </a>
            <button
              type="button"
              className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
              onClick={async () => {
                try {
                  const absolute = new URL(proofPackHref, window.location.origin).toString();
                  const ok = await copyToClipboard(absolute);
                  if (ok) {
                    setToastKind("success");
                    setToastMessage("Proof pack link copied.");
                  } else {
                    setToastKind("error");
                    setToastMessage("Copy failed.");
                  }
                } catch {
                  setToastKind("error");
                  setToastMessage("Copy failed.");
                }
              }}
            >
              Copy link
            </button>
          </div>
        </div>

        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-zinc-500">Verify locally</summary>
          <div className="mt-2 grid gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <div>
              Run from <span className="font-mono">apps/web</span> after downloading the ZIP:
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <pre className="overflow-auto rounded bg-zinc-50 px-2 py-1 font-mono text-[11px] text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                npm run verify:proofpack -- &lt;path-to-zip&gt;
              </pre>
              <button
                type="button"
                className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                onClick={async () => {
                  const ok = await copyToClipboard("npm run verify:proofpack -- <path-to-zip>");
                  setToastKind(ok ? "success" : "error");
                  setToastMessage(ok ? "Command copied." : "Copy failed.");
                }}
              >
                Copy
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <pre className="overflow-auto rounded bg-zinc-50 px-2 py-1 font-mono text-[11px] text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                npm run verify:proofpack -- --require-signed &lt;path-to-zip&gt;
              </pre>
              <button
                type="button"
                className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                onClick={async () => {
                  const ok = await copyToClipboard(
                    "npm run verify:proofpack -- --require-signed <path-to-zip>"
                  );
                  setToastKind(ok ? "success" : "error");
                  setToastMessage(ok ? "Command copied." : "Copy failed.");
                }}
              >
                Copy
              </button>
            </div>
          </div>
        </details>

        {transitions.length ? (
          <div className="mt-3 rounded border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-zinc-500">Latest transition:</span>
              <span className="font-mono">
                {transitions[transitions.length - 1]!.from_status ?? "∅"} → {transitions[transitions.length - 1]!.to_status}
              </span>
              <span className="text-zinc-500">@</span>
              <span className="font-mono text-xs text-zinc-600 dark:text-zinc-300">
                {transitions[transitions.length - 1]!.created_at}
              </span>
            </div>
            {transitions[transitions.length - 1]!.reason_code ? (
              <div className="mt-1 font-mono text-xs text-zinc-600 dark:text-zinc-300">
                {transitions[transitions.length - 1]!.reason_code}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 text-sm">
          <div>
            <span className="text-zinc-500">Status:</span> {trade.status}
          </div>

          {actingRole ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-zinc-500">You are:</span>
              <span
                className={
                  actingRole === "buyer"
                    ? "rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200"
                    : "rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-200"
                }
              >
                {actingRole}
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">Lifecycle:</span>

            <button
              type="button"
              className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
              disabled={
                transitioning ||
                !canTransitionTrade(trade.status, "awaiting_payment")
              }
              onClick={() => void transitionTrade("awaiting_payment")}
              title={lifecycleTitle("awaiting_payment") || "created → awaiting_payment"}
            >
              Awaiting payment
            </button>

            <button
              type="button"
              className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
              disabled={
                transitioning ||
                !canTransitionTrade(trade.status, "paid_marked") ||
                actingUserId !== trade.buyer_user_id
              }
              onClick={() => void transitionTrade("paid_marked")}
              title={
                lifecycleTitle("paid_marked", { role: "buyer" }) ||
                "awaiting_payment → paid_marked"
              }
            >
              Mark paid (buyer)
            </button>

            <button
              type="button"
              className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
              disabled={
                transitioning ||
                !canTransitionTrade(trade.status, "released") ||
                actingUserId !== trade.seller_user_id
              }
              onClick={() => void transitionTrade("released")}
              title={
                lifecycleTitle("released", { role: "seller" }) || "paid_marked → released"
              }
            >
              Release (seller)
            </button>

            <button
              type="button"
              className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
              disabled={transitioning || !canTransitionTrade(trade.status, "resolved")}
              onClick={() => void transitionTrade("resolved")}
              title={lifecycleTitle("resolved") || "Resolve trade"}
            >
              Resolve
            </button>

            <button
              type="button"
              className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/40"
              disabled={
                transitioning ||
                trade.status === "disputed" ||
                !canTransitionTrade(trade.status, "canceled")
              }
              onClick={() => void transitionTrade("canceled")}
              title={lifecycleTitle("canceled") || "Cancel trade"}
            >
              Cancel
            </button>
          </div>

          <div>
            <span className="text-zinc-500">Pair:</span> {trade.crypto_asset}/
            {trade.fiat_currency}
          </div>
          <div className="font-mono">
            <span className="text-zinc-500 font-sans">Price:</span> {trade.price}
          </div>
          <div className="font-mono">
            <span className="text-zinc-500 font-sans">Fair mid:</span> {trade.fair_price_mid ?? "—"}
          </div>
          <div className="font-mono">
            <span className="text-zinc-500 font-sans">Deviation pct:</span> {trade.price_deviation_pct ?? "—"}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono text-zinc-500">{trade.id}</span>
            <button
              type="button"
              className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
              onClick={async () => {
                const ok = await copyToClipboard(trade.id);
                setToastKind(ok ? "success" : "error");
                setToastMessage(ok ? "Trade ID copied." : "Copy failed.");
              }}
            >
              Copy ID
            </button>
            <button
              type="button"
              className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
              onClick={async () => {
                try {
                  const relative = actingUserId
                    ? `/trades/${trade.id}?user_id=${encodeURIComponent(actingUserId)}`
                    : `/trades/${trade.id}`;
                  const absolute = new URL(relative, window.location.origin).toString();
                  const ok = await copyToClipboard(absolute);
                  setToastKind(ok ? "success" : "error");
                  setToastMessage(ok ? "Trade link copied." : "Copy failed.");
                } catch {
                  setToastKind("error");
                  setToastMessage("Copy failed.");
                }
              }}
            >
              Copy link
            </button>
          </div>
        </div>
      </section>

      <section className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Risk</h2>
          <button
            className="rounded bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-black"
            onClick={() => void runRiskAssessment()}
          >
            Recompute v0
          </button>
        </div>

        {risk ? (
          <div className="mt-3 text-sm">
            <div>
              <span className="text-zinc-500">Score:</span> {risk.score}
            </div>
            <div>
              <span className="text-zinc-500">Action:</span> {risk.recommended_action}
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-zinc-500">Factors JSON</summary>
              <pre className="mt-2 overflow-auto rounded bg-zinc-50 p-3 text-xs dark:bg-zinc-950">
                {formatJson(risk.factors_json)}
              </pre>
            </details>
          </div>
        ) : (
          <div className="mt-3 text-sm text-zinc-500">No risk assessment yet.</div>
        )}
      </section>

      <section className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">Evidence</h2>

        <div className="mt-2 text-sm text-zinc-500">
          Completeness score: <span className="font-mono">{evidenceCompleteness.score}</span>/100
          {evidenceCompleteness.missing_recommendations.length ? (
            <span>
              {" "}— next: {evidenceCompleteness.missing_recommendations.join(", ")}
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid gap-3">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-zinc-500">Submitted by</span>
              <select
                className="rounded border border-zinc-200 bg-transparent px-2 py-2 dark:border-zinc-800"
                value={submittedBy}
                onChange={(e) => setSubmittedBy(e.target.value)}
              >
                <option value={trade.buyer_user_id}>buyer {trade.buyer_user_id.slice(0, 8)}…</option>
                <option value={trade.seller_user_id}>seller {trade.seller_user_id.slice(0, 8)}…</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-zinc-500">Type</span>
              <select
                className="rounded border border-zinc-200 bg-transparent px-2 py-2 dark:border-zinc-800"
                value={uploadType}
                onChange={(e) => setUploadType(e.target.value as typeof uploadType)}
              >
                <option value="receipt">receipt</option>
                <option value="screenshot">screenshot</option>
                <option value="bank_sms">bank_sms</option>
                <option value="chat_export">chat_export</option>
                <option value="other">other</option>
              </select>
            </label>
          </div>

          <label className="grid gap-1 text-sm">
            <span className="text-zinc-500">Metadata JSON</span>
            <textarea
              className="min-h-20 rounded border border-zinc-200 bg-transparent px-2 py-2 font-mono text-xs dark:border-zinc-800"
              value={metadataJson}
              onChange={(e) => setMetadataJson(e.target.value)}
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-zinc-500">File</span>
            <input
              className="text-sm"
              type="file"
              onChange={(e) => setFile(e.target.files?.item(0) ?? null)}
            />
          </label>

          <div className="flex items-center gap-3">
            <button
              className="rounded bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-black"
              disabled={uploading}
              onClick={() => void uploadEvidence()}
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <button
              className="text-sm underline"
              onClick={() => void refreshAll()}
            >
              Refresh
            </button>
          </div>

          <div className="mt-2 rounded border border-zinc-200 dark:border-zinc-800">
            <div className="border-b border-zinc-200 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-800">
              Evidence objects ({evidence.length})
            </div>
            <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              {evidence.map((ev) => (
                <li key={ev.id} className="px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-zinc-500">{ev.type}</span> — {ev.sha256.slice(0, 10)}…
                    </div>
                    <div className="text-xs text-zinc-500">{ev.created_at}</div>
                  </div>
                  <div className="mt-1 font-mono text-xs text-zinc-500">
                    {ev.storage_uri}
                  </div>
                </li>
              ))}
              {evidence.length === 0 ? (
                <li className="px-3 py-3 text-sm text-zinc-500">No evidence yet.</li>
              ) : null}
            </ul>
          </div>
        </div>
      </section>

      <section className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">Dispute</h2>

        {dispute ? (
          <div className="mt-3 grid gap-3 text-sm">
            <div>
              <span className="text-zinc-500">Status:</span> {dispute.status}
            </div>
            <div>
              <span className="text-zinc-500">Reason:</span> {dispute.reason_code}
            </div>
            <div className="font-mono text-xs text-zinc-500">
              opened_by={dispute.opened_by_user_id} opened_at={dispute.opened_at}
            </div>

            <div className="rounded border border-zinc-200 dark:border-zinc-800">
              <div className="border-b border-zinc-200 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-800">
                Decisions ({disputeDecisions.length})
              </div>
              <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                {disputeDecisions.map((d) => (
                  <li key={d.id} className="px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-zinc-500">{d.decision}</span> — {d.decided_by}
                      </div>
                      <div className="text-xs text-zinc-500">{d.created_at}</div>
                    </div>
                    {d.rationale ? (
                      <div className="mt-1 text-xs text-zinc-500">{d.rationale}</div>
                    ) : null}
                  </li>
                ))}
                {disputeDecisions.length === 0 ? (
                  <li className="px-3 py-3 text-sm text-zinc-500">
                    No decisions yet.
                  </li>
                ) : null}
              </ul>
            </div>

            {dispute.status !== "resolved" ? (
              <div className="mt-2 grid gap-2">
                <div className="text-sm text-zinc-500">Add decision (demo)</div>

                <label className="grid gap-1 text-sm">
                  <span className="text-zinc-500">Decided by</span>
                  <input
                    className="rounded border border-zinc-200 bg-transparent px-2 py-2 dark:border-zinc-800"
                    value={decisionBy}
                    onChange={(e) => setDecisionBy(e.target.value)}
                  />
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="text-zinc-500">Reviewer key (optional)</span>
                  <input
                    className="rounded border border-zinc-200 bg-transparent px-2 py-2 font-mono text-xs dark:border-zinc-800"
                    placeholder="PROOFPACK_REVIEWER_KEY"
                    value={reviewerKey}
                    onChange={(e) => setReviewerKey(e.target.value)}
                  />
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="text-zinc-500">Decision</span>
                  <select
                    className="rounded border border-zinc-200 bg-transparent px-2 py-2 dark:border-zinc-800"
                    value={decisionType}
                    onChange={(e) => setDecisionType(e.target.value as typeof decisionType)}
                  >
                    <option value="release_to_buyer">release_to_buyer</option>
                    <option value="refund_buyer">refund_buyer</option>
                    <option value="release_to_seller">release_to_seller</option>
                    <option value="cancel_trade">cancel_trade</option>
                  </select>
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="text-zinc-500">Rationale</span>
                  <textarea
                    className="min-h-20 rounded border border-zinc-200 bg-transparent px-2 py-2 text-sm dark:border-zinc-800"
                    value={decisionRationale}
                    onChange={(e) => setDecisionRationale(e.target.value)}
                  />
                </label>

                <div className="flex items-center gap-3">
                  <button
                    className="rounded bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-black"
                    disabled={submittingDecision}
                    onClick={() => void submitDecision()}
                  >
                    {submittingDecision ? "Submitting…" : "Submit decision"}
                  </button>
                  <button className="text-sm underline" onClick={() => void refreshAll()}>
                    Refresh
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-zinc-500">Resolved at {dispute.resolved_at ?? "—"}</div>
            )}
          </div>
        ) : (
          <div className="mt-3 grid gap-3">
            <div className="text-sm text-zinc-500">No dispute yet.</div>

            <div className="grid gap-2 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-zinc-500">Opened by</span>
                <select
                  className="rounded border border-zinc-200 bg-transparent px-2 py-2 dark:border-zinc-800"
                  value={disputeOpenedBy}
                  onChange={(e) => setDisputeOpenedBy(e.target.value)}
                >
                  <option value={trade.buyer_user_id}>buyer {trade.buyer_user_id.slice(0, 8)}…</option>
                  <option value={trade.seller_user_id}>seller {trade.seller_user_id.slice(0, 8)}…</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-zinc-500">Reason</span>
                <select
                  className="rounded border border-zinc-200 bg-transparent px-2 py-2 dark:border-zinc-800"
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value as typeof disputeReason)}
                >
                  <option value="non_payment">non_payment</option>
                  <option value="chargeback">chargeback</option>
                  <option value="phishing">phishing</option>
                  <option value="other">other</option>
                </select>
              </label>
            </div>

            <div className="flex items-center gap-3">
              <button
                className="rounded bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-black"
                disabled={openingDispute}
                onClick={() => void openDispute()}
              >
                {openingDispute ? "Opening…" : "Open dispute"}
              </button>
              <button className="text-sm underline" onClick={() => void refreshAll()}>
                Refresh
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">Transitions</h2>
        <ul className="mt-3 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          {transitions.map((t) => (
            <li key={t.id} className="py-2">
              <div>
                <span className="text-zinc-500">{t.created_at}</span> — {t.from_status ?? "∅"} → {t.to_status}
              </div>
              <div className="text-xs text-zinc-500 font-mono">
                {t.reason_code ?? ""}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
