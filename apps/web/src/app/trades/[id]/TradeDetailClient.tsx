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
import { V2Button } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { V2Input } from "@/components/v2/Input";

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
  const [disputeActionError, setDisputeActionError] = useState<ClientApiError | null>(null);

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
      setDisputeActionError({ code: "missing_opened_by_user_id" });
      return;
    }

    setOpeningDispute(true);
    setDisputeActionError(null);

    try {
      if (authMode === "session" && sessionUserId && disputeOpenedBy && sessionUserId !== disputeOpenedBy) {
        setDisputeActionError({ code: "session_user_mismatch" });
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
      setToastKind("success");
      setToastMessage("Dispute opened.");
      await refreshAll();
    } catch (e) {
      if (e instanceof ApiError) {
        setDisputeActionError({ code: e.code, details: e.details });
      } else {
        setDisputeActionError({ code: e instanceof Error ? e.message : "open_dispute_failed" });
      }
    } finally {
      setOpeningDispute(false);
    }
  }

  async function submitDecision() {
    if (!decisionBy) {
      setDisputeActionError({ code: "missing_decided_by" });
      return;
    }

    setSubmittingDecision(true);
    setDisputeActionError(null);

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
      setToastKind("success");
      setToastMessage("Decision submitted.");
      await refreshAll();
    } catch (e) {
      if (e instanceof ApiError) {
        setDisputeActionError({ code: e.code, details: e.details });
      } else {
        setDisputeActionError({ code: e instanceof Error ? e.message : "submit_decision_failed" });
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
    return <div className="mt-6 text-[13px] text-[var(--v2-muted)]">Loading…</div>;
  }

  if (error) {
    return <ApiErrorBanner error={error} className="mt-6" onRetry={() => void refreshAll()} />;
  }

  if (!trade) {
    return <div className="mt-6 text-[13px] text-[var(--v2-muted)]">Not found.</div>;
  }

  const selectClass =
    "h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[14px] font-semibold text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)] outline-none focus:ring-2 focus:ring-[var(--v2-ring)]";
  const selectClassSm =
    "h-9 rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-[12px] font-semibold text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)] outline-none focus:ring-2 focus:ring-[var(--v2-ring)]";
  const textareaClass =
    "min-h-20 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-2 text-[13px] text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)] outline-none focus:ring-2 focus:ring-[var(--v2-ring)]";
  const preClass =
    "overflow-auto rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 font-mono text-[12px] text-[var(--v2-text)]";

  const disputeStatusBadgeClass = (status: string) =>
    status === "resolved"
      ? "rounded-full border border-[color-mix(in_srgb,var(--v2-up)_35%,transparent)] bg-[color-mix(in_srgb,var(--v2-up)_16%,transparent)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-up)]"
      : status === "open"
        ? "rounded-full border border-[color-mix(in_srgb,var(--v2-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--v2-accent)_18%,transparent)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-accent)]"
        : "rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-muted)]";

  const disputeDecisionBadgeClass = (decision: string) => {
    if (decision === "release_to_buyer" || decision === "refund_buyer") {
      return "rounded-full border border-[color-mix(in_srgb,var(--v2-up)_35%,transparent)] bg-[color-mix(in_srgb,var(--v2-up)_16%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-up)]";
    }
    if (decision === "release_to_seller") {
      return "rounded-full border border-[color-mix(in_srgb,var(--v2-accent-2)_35%,transparent)] bg-[color-mix(in_srgb,var(--v2-accent-2)_16%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-accent-2)]";
    }
    if (decision === "cancel_trade") {
      return "rounded-full border border-[color-mix(in_srgb,var(--v2-down)_35%,transparent)] bg-[color-mix(in_srgb,var(--v2-down)_14%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-down)]";
    }
    return "rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-muted)]";
  };

  return (
    <div className="mt-6 grid gap-6">
      <Toast
        message={toastMessage}
        kind={toastKind}
        onDone={() => setToastMessage(null)}
      />

      <V2Card>
        <V2CardHeader
          title="Viewer"
          subtitle={
            <span>
              Auth: use a session cookie (recommended) or send{" "}
              <span className="font-mono">x-user-id</span>.
            </span>
          }
        />
        <V2CardBody>
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[12px] text-[var(--v2-muted)]">
                <span className="font-semibold">Auth mode</span>
                <select
                  className={selectClassSm}
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
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--v2-muted)]">
                <span className="font-semibold">Session</span>
                <span className="font-mono">
                  {sessionUserId ? `${sessionUserId.slice(0, 8)}…` : "(none)"}
                </span>
                <V2Button
                  size="sm"
                  variant="secondary"
                  disabled={!actingUserId || sessionLoading}
                  onClick={() => void signInAs(actingUserId)}
                >
                  Sign in
                </V2Button>
                <V2Button
                  size="sm"
                  variant="secondary"
                  disabled={sessionLoading}
                  onClick={() => void signOut()}
                >
                  Sign out
                </V2Button>
                <details>
                  <summary className="cursor-pointer text-[11px] font-semibold text-[var(--v2-muted)]">prod bootstrap</summary>
                  <div className="mt-2 grid gap-1">
                    <label className="grid gap-1">
                      <span className="text-[11px] font-semibold text-[var(--v2-muted)]">x-session-bootstrap-key</span>
                      <V2Input
                        className="h-10 font-mono text-[12px]"
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
              <div className="text-[12px] text-[var(--v2-muted)]">Requests send x-user-id.</div>
            )}
          </div>

          <label className="grid gap-1">
            <span className="text-[12px] font-semibold text-[var(--v2-muted)]">Acting user</span>
            <select
              className={selectClass}
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
        </V2CardBody>
      </V2Card>

      <V2Card>
        <V2CardHeader
          title="Trade"
          right={
            <div className="flex items-center gap-2">
              <a className="text-[13px] font-semibold text-[var(--v2-accent-2)] underline" href={proofPackHref}>
                Download Proof Pack
              </a>
              <V2Button
                size="sm"
                variant="secondary"
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
              </V2Button>
            </div>
          }
        />
        <V2CardBody>

        <details className="mt-2">
          <summary className="cursor-pointer text-[12px] font-semibold text-[var(--v2-muted)]">Verify locally</summary>
          <div className="mt-2 grid gap-2 text-[12px] text-[var(--v2-muted)]">
            <div>
              Run from <span className="font-mono">apps/web</span> after downloading the ZIP:
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <pre className={preClass}>
                npm run verify:proofpack -- &lt;path-to-zip&gt;
              </pre>
              <V2Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const ok = await copyToClipboard("npm run verify:proofpack -- <path-to-zip>");
                  setToastKind(ok ? "success" : "error");
                  setToastMessage(ok ? "Command copied." : "Copy failed.");
                }}
              >
                Copy
              </V2Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <pre className={preClass}>
                npm run verify:proofpack -- --require-signed &lt;path-to-zip&gt;
              </pre>
              <V2Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const ok = await copyToClipboard(
                    "npm run verify:proofpack -- --require-signed <path-to-zip>"
                  );
                  setToastKind(ok ? "success" : "error");
                  setToastMessage(ok ? "Command copied." : "Copy failed.");
                }}
              >
                Copy
              </V2Button>
            </div>
          </div>
        </details>

        {transitions.length ? (
          <div className="mt-3 rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[var(--v2-muted)]">Latest transition:</span>
              <span className="font-mono">
                {transitions[transitions.length - 1]!.from_status ?? "∅"} → {transitions[transitions.length - 1]!.to_status}
              </span>
              <span className="text-[var(--v2-muted)]">@</span>
              <span className="font-mono text-[12px] text-[var(--v2-muted)]">
                {transitions[transitions.length - 1]!.created_at}
              </span>
            </div>
            {transitions[transitions.length - 1]!.reason_code ? (
              <div className="mt-1 font-mono text-[12px] text-[var(--v2-muted)]">
                {transitions[transitions.length - 1]!.reason_code}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 text-[13px] text-[var(--v2-text)]">
          <div>
            <span className="text-[var(--v2-muted)]">Status:</span> {trade.status}
          </div>

          {actingRole ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[var(--v2-muted)]">You are:</span>
              <span
                className={
                  actingRole === "buyer"
                    ? "rounded-full border border-[color-mix(in_srgb,var(--v2-up)_35%,var(--v2-border))] bg-[color-mix(in_srgb,var(--v2-up)_10%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-up)]"
                    : "rounded-full border border-[color-mix(in_srgb,var(--v2-accent-2)_35%,var(--v2-border))] bg-[color-mix(in_srgb,var(--v2-accent-2)_10%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-accent-2)]"
                }
              >
                {actingRole}
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-[var(--v2-muted)]">Lifecycle:</span>

            <V2Button
              size="sm"
              variant="secondary"
              disabled={
                transitioning ||
                !canTransitionTrade(trade.status, "awaiting_payment")
              }
              onClick={() => void transitionTrade("awaiting_payment")}
              title={lifecycleTitle("awaiting_payment") || "created → awaiting_payment"}
            >
              Awaiting payment
            </V2Button>

            <V2Button
              size="sm"
              variant="secondary"
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
            </V2Button>

            <V2Button
              size="sm"
              variant="secondary"
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
            </V2Button>

            <V2Button
              size="sm"
              variant="secondary"
              disabled={transitioning || !canTransitionTrade(trade.status, "resolved")}
              onClick={() => void transitionTrade("resolved")}
              title={lifecycleTitle("resolved") || "Resolve trade"}
            >
              Resolve
            </V2Button>

            <V2Button
              size="sm"
              variant="danger"
              disabled={
                transitioning ||
                trade.status === "disputed" ||
                !canTransitionTrade(trade.status, "canceled")
              }
              onClick={() => void transitionTrade("canceled")}
              title={lifecycleTitle("canceled") || "Cancel trade"}
            >
              Cancel
            </V2Button>
          </div>

          <div>
            <span className="text-[var(--v2-muted)]">Pair:</span> {trade.crypto_asset}/
            {trade.fiat_currency}
          </div>
          <div className="font-mono">
            <span className="text-[var(--v2-muted)] font-sans">Price:</span> {trade.price}
          </div>
          <div className="font-mono">
            <span className="text-[var(--v2-muted)] font-sans">Fair mid:</span> {trade.fair_price_mid ?? "—"}
          </div>
          <div className="font-mono">
            <span className="text-[var(--v2-muted)] font-sans">Deviation pct:</span> {trade.price_deviation_pct ?? "—"}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="font-mono text-[var(--v2-muted)]">{trade.id}</span>
            <V2Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const ok = await copyToClipboard(trade.id);
                setToastKind(ok ? "success" : "error");
                setToastMessage(ok ? "Trade ID copied." : "Copy failed.");
              }}
            >
              Copy ID
            </V2Button>
            <V2Button
              size="sm"
              variant="secondary"
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
            </V2Button>
          </div>
        </div>
      </V2CardBody>
      </V2Card>

      <V2Card>
        <V2CardHeader
          title="Risk"
          right={
            <V2Button variant="secondary" onClick={() => void runRiskAssessment()}>
              Recompute v0
            </V2Button>
          }
        />
        <V2CardBody>

        {risk ? (
          <div className="mt-1 text-[13px]">
            <div>
              <span className="text-[var(--v2-muted)]">Score:</span> {risk.score}
            </div>
            <div>
              <span className="text-[var(--v2-muted)]">Action:</span> {risk.recommended_action}
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-[12px] font-semibold text-[var(--v2-muted)]">Factors JSON</summary>
              <pre className={"mt-2 " + preClass}>
                {formatJson(risk.factors_json)}
              </pre>
            </details>
          </div>
        ) : (
          <div className="mt-1 text-[13px] text-[var(--v2-muted)]">No risk assessment yet.</div>
        )}
        </V2CardBody>
      </V2Card>

      <V2Card>
        <V2CardHeader title="Evidence" />
        <V2CardBody>

        <div className="text-[13px] text-[var(--v2-muted)]">
          Completeness score: <span className="font-mono">{evidenceCompleteness.score}</span>/100
          {evidenceCompleteness.missing_recommendations.length ? (
            <span>
              {" "}— next: {evidenceCompleteness.missing_recommendations.join(", ")}
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid gap-3">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-[12px] font-semibold text-[var(--v2-muted)]">Submitted by</span>
              <select
                className={selectClass}
                value={submittedBy}
                onChange={(e) => setSubmittedBy(e.target.value)}
              >
                <option value={trade.buyer_user_id}>buyer {trade.buyer_user_id.slice(0, 8)}…</option>
                <option value={trade.seller_user_id}>seller {trade.seller_user_id.slice(0, 8)}…</option>
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-[12px] font-semibold text-[var(--v2-muted)]">Type</span>
              <select
                className={selectClass}
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

          <label className="grid gap-1">
            <span className="text-[12px] font-semibold text-[var(--v2-muted)]">Metadata JSON</span>
            <textarea
              className={textareaClass + " font-mono text-[12px]"}
              value={metadataJson}
              onChange={(e) => setMetadataJson(e.target.value)}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-[12px] font-semibold text-[var(--v2-muted)]">File</span>
            <input
              className="text-[13px] text-[var(--v2-text)]"
              type="file"
              onChange={(e) => setFile(e.target.files?.item(0) ?? null)}
            />
          </label>

          <div className="flex items-center gap-3">
            <V2Button
              variant="primary"
              disabled={uploading}
              onClick={() => void uploadEvidence()}
            >
              {uploading ? "Uploading…" : "Upload"}
            </V2Button>
            <V2Button variant="ghost" onClick={() => void refreshAll()}>
              Refresh
            </V2Button>
          </div>

          <div className="mt-2 rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)]">
            <div className="border-b border-[var(--v2-border)] px-3 py-2 text-[12px] font-semibold text-[var(--v2-muted)]">
              Evidence objects ({evidence.length})
            </div>
            <ul className="divide-y divide-[var(--v2-border)] text-[13px]">
              {evidence.map((ev) => (
                <li key={ev.id} className="px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[var(--v2-muted)]">{ev.type}</span> — {ev.sha256.slice(0, 10)}…
                    </div>
                    <div className="text-[12px] text-[var(--v2-muted)]">{ev.created_at}</div>
                  </div>
                  <div className="mt-1 font-mono text-[12px] text-[var(--v2-muted)]">
                    {ev.storage_uri}
                  </div>
                </li>
              ))}
              {evidence.length === 0 ? (
                <li className="px-3 py-3 text-[13px] text-[var(--v2-muted)]">No evidence yet.</li>
              ) : null}
            </ul>
          </div>
        </div>
        </V2CardBody>
      </V2Card>

      <V2Card>
        <V2CardHeader title="Dispute" />
        <V2CardBody>

        {disputeActionError ? (
          <ApiErrorBanner error={disputeActionError} className="mb-3" />
        ) : null}

        {dispute ? (
          <div className="grid gap-3 text-[13px]">
            <div className="flex items-center gap-2">
              <span className="text-[var(--v2-muted)]">Status:</span>
              <span className={disputeStatusBadgeClass(dispute.status)}>{dispute.status}</span>
            </div>
            <div>
              <span className="text-[var(--v2-muted)]">Reason:</span> {dispute.reason_code}
            </div>
            <div className="font-mono text-[12px] text-[var(--v2-muted)]">
              opened_by={dispute.opened_by_user_id} opened_at={dispute.opened_at}
            </div>

            <div className="rounded-2xl border border-[var(--v2-border)]">
              <div className="border-b border-[var(--v2-border)] px-3 py-2 text-[12px] font-semibold text-[var(--v2-muted)]">
                Decisions ({disputeDecisions.length})
              </div>
              <ul className="divide-y divide-[var(--v2-border)] text-[13px]">
                {disputeDecisions.map((d) => (
                  <li key={d.id} className="px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className={disputeDecisionBadgeClass(d.decision)}>{d.decision}</span> — {d.decided_by}
                      </div>
                      <div className="text-[12px] text-[var(--v2-muted)]">{d.created_at}</div>
                    </div>
                    {d.rationale ? (
                      <div className="mt-1 text-[12px] text-[var(--v2-muted)]">{d.rationale}</div>
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
                <div className="text-[13px] text-[var(--v2-muted)]">Add decision (demo)</div>

                <label className="grid gap-1">
                  <span className="text-[12px] font-semibold text-[var(--v2-muted)]">Decided by</span>
                  <V2Input
                    value={decisionBy}
                    onChange={(e) => setDecisionBy(e.target.value)}
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-[12px] font-semibold text-[var(--v2-muted)]">Reviewer key (optional)</span>
                  <V2Input
                    className="font-mono text-[12px]"
                    placeholder="PROOFPACK_REVIEWER_KEY"
                    value={reviewerKey}
                    onChange={(e) => setReviewerKey(e.target.value)}
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-[12px] font-semibold text-[var(--v2-muted)]">Decision</span>
                  <select
                    className={selectClass}
                    value={decisionType}
                    onChange={(e) => setDecisionType(e.target.value as typeof decisionType)}
                  >
                    <option value="release_to_buyer">release_to_buyer</option>
                    <option value="refund_buyer">refund_buyer</option>
                    <option value="release_to_seller">release_to_seller</option>
                    <option value="cancel_trade">cancel_trade</option>
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-[12px] font-semibold text-[var(--v2-muted)]">Rationale</span>
                  <textarea
                    className={textareaClass}
                    value={decisionRationale}
                    onChange={(e) => setDecisionRationale(e.target.value)}
                  />
                </label>

                <div className="flex items-center gap-3">
                  <V2Button
                    variant="primary"
                    disabled={submittingDecision}
                    onClick={() => void submitDecision()}
                  >
                    {submittingDecision ? "Submitting…" : "Submit decision"}
                  </V2Button>
                  <V2Button variant="ghost" onClick={() => void refreshAll()}>
                    Refresh
                  </V2Button>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-[13px] text-[var(--v2-muted)]">Resolved at {dispute.resolved_at ?? "—"}</div>
            )}
          </div>
        ) : (
          <div className="mt-3 grid gap-3">
            <div className="text-[13px] text-[var(--v2-muted)]">No dispute yet.</div>

            <div className="grid gap-2 md:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-[12px] font-semibold text-[var(--v2-muted)]">Opened by</span>
                <select
                  className={selectClass}
                  value={disputeOpenedBy}
                  onChange={(e) => setDisputeOpenedBy(e.target.value)}
                >
                  <option value={trade.buyer_user_id}>buyer {trade.buyer_user_id.slice(0, 8)}…</option>
                  <option value={trade.seller_user_id}>seller {trade.seller_user_id.slice(0, 8)}…</option>
                </select>
              </label>

              <label className="grid gap-1">
                <span className="text-[12px] font-semibold text-[var(--v2-muted)]">Reason</span>
                <select
                  className={selectClass}
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
              <V2Button
                variant="primary"
                disabled={openingDispute}
                onClick={() => void openDispute()}
              >
                {openingDispute ? "Opening…" : "Open dispute"}
              </V2Button>
              <V2Button variant="ghost" onClick={() => void refreshAll()}>
                Refresh
              </V2Button>
            </div>
          </div>
        )}
        </V2CardBody>
      </V2Card>

      <V2Card>
        <V2CardHeader title="Transitions" />
        <V2CardBody>
        <ul className="divide-y divide-[var(--v2-border)] text-[13px]">
          {transitions.map((t) => (
            <li key={t.id} className="py-2">
              <div>
                <span className="text-[var(--v2-muted)]">{t.created_at}</span> — {t.from_status ?? "∅"} → {t.to_status}
              </div>
              <div className="text-[12px] text-[var(--v2-muted)] font-mono">
                {t.reason_code ?? ""}
              </div>
            </li>
          ))}
        </ul>
        </V2CardBody>
      </V2Card>
    </div>
  );
}
