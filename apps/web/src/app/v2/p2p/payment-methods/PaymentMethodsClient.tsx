"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { V2Button } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { V2Input } from "@/components/v2/Input";
import { V2Sheet } from "@/components/v2/Sheet";
import { V2Skeleton } from "@/components/v2/Skeleton";
import { describeClientError, formatClientErrorDetails } from "@/lib/api/errorMessages";

type PaymentMethod = {
  id: string;
  identifier: string;
  name: string;
  details: any;
  created_at?: string;
};

type ApiErr = { error: string; message?: string; details?: any };

function parseJsonSafe(raw: string): { value: any | null; error: string | null } {
  const text = String(raw ?? "").trim();
  if (!text) return { value: {}, error: null };
  try {
    return { value: JSON.parse(text), error: null };
  } catch {
    return { value: null, error: "Details JSON is invalid." };
  }
}

function paymentMethodRules(identifier: string): { required: string[]; tips: string[] } {
  const id = String(identifier ?? "").trim().toLowerCase();
  if (id === "mpesa") {
    return {
      required: ["phoneNumber"],
      tips: ["Use a receivable phone number.", "Format example: 0712345678 or +254712345678."],
    };
  }
  if (id === "bank_transfer" || id === "bank") {
    return {
      required: ["bankName", "accountName", "accountNumber"],
      tips: ["Use exact account holder name.", "Include branch/swift in optional fields if needed."],
    };
  }
  return {
    required: [],
    tips: ["Store only payout details you are comfortable sharing with matched counterparties."],
  };
}

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return match?.[1] ?? null;
}

function isVerifiedAgent(details: any): boolean {
  if (!details || typeof details !== "object" || Array.isArray(details)) return false;
  const raw = (details as any).verifiedAgent;
  if (raw === true) return true;
  if (typeof raw === "string" && raw.trim().toLowerCase() === "true") return true;
  return false;
}

function errText(err: ApiErr | null): { title: string; lines: string[] } | null {
  if (!err?.error) return null;
  const info = describeClientError(err.error);
  const detailLines = formatClientErrorDetails(err.details) ?? [];
  const msg = typeof err.message === "string" && err.message ? [err.message] : [];
  const lines = [...msg, ...detailLines].filter(Boolean);
  return { title: info.title, lines: lines.length ? lines : [info.message] };
}

export function PaymentMethodsClient() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<ApiErr | null>(null);

  const loadSeqRef = useRef(0);
  const load = async () => {
    const seq = ++loadSeqRef.current;
    setLoadErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/p2p/payment-methods", { cache: "no-store", credentials: "include" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const code = typeof json?.error === "string" ? json.error : `http_${res.status}`;
        setLoadErr({ error: code, message: json?.message, details: json?.details });
        return;
      }
      if (seq !== loadSeqRef.current) return;
      setMethods(Array.isArray(json?.methods) ? json.methods : []);
    } catch (e) {
      setLoadErr({ error: "internal_error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<ApiErr | null>(null);
  const [newIdentifier, setNewIdentifier] = useState("mpesa");
  const [newName, setNewName] = useState("M-Pesa");
  const [newDetailsJson, setNewDetailsJson] = useState("{\n  \"phoneNumber\": \"\"\n}");

  const exampleMpesa = useMemo(() => "{\n  \"phoneNumber\": \"0712345678\"\n}", []);

  const openCreate = () => {
    setCreateErr(null);
    setNewIdentifier("mpesa");
    setNewName("M-Pesa");
    setNewDetailsJson("{\n  \"phoneNumber\": \"\"\n}");
    setCreateOpen(true);
  };

  const create = async () => {
    if (creating) return;
    setCreateErr(null);

    const identifier = newIdentifier.trim();
    const name = newName.trim();
    const raw = newDetailsJson.trim();
    if (!identifier) {
      setCreateErr({ error: "invalid_input", message: "Enter a method identifier (e.g. mpesa)." });
      return;
    }
    if (!name) {
      setCreateErr({ error: "invalid_input", message: "Enter a name/label." });
      return;
    }

    let details: any = {};
    if (raw) {
      try {
        details = JSON.parse(raw);
      } catch {
        setCreateErr({ error: "invalid_input", message: "Details must be valid JSON." });
        return;
      }
    }
    if (identifier.toLowerCase() === "mpesa") {
      const phoneNumber = typeof details?.phoneNumber === "string" ? details.phoneNumber.trim() : "";
      if (!phoneNumber) {
        setCreateErr({ error: "invalid_input", message: "For mpesa, details.phoneNumber is required." });
        return;
      }
    }

    setCreating(true);
    try {
      const csrf = getCsrfToken();
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (csrf) headers["x-csrf-token"] = csrf;

      const res = await fetch("/api/p2p/payment-methods", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ identifier, name, details }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const code = typeof json?.error === "string" ? json.error : `http_${res.status}`;
        setCreateErr({ error: code, message: json?.message, details: json?.details });
        return;
      }

      setCreateOpen(false);
      await load();
    } catch (e) {
      setCreateErr({ error: "internal_error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setCreating(false);
    }
  };

  const [editOpen, setEditOpen] = useState(false);
  const [editErr, setEditErr] = useState<ApiErr | null>(null);
  const [editing, setEditing] = useState(false);
  const [editMethod, setEditMethod] = useState<PaymentMethod | null>(null);
  const [editName, setEditName] = useState("");
  const [editDetailsJson, setEditDetailsJson] = useState("{}");

  const openEdit = (m: PaymentMethod) => {
    setEditErr(null);
    setEditMethod(m);
    setEditName(String(m.name ?? ""));
    try {
      setEditDetailsJson(JSON.stringify(m.details ?? {}, null, 2));
    } catch {
      setEditDetailsJson("{}");
    }
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editMethod || editing) return;
    setEditErr(null);

    const name = editName.trim();
    if (!name) {
      setEditErr({ error: "invalid_input", message: "Enter a name/label." });
      return;
    }

    let details: any = {};
    try {
      details = JSON.parse(editDetailsJson || "{}");
    } catch {
      setEditErr({ error: "invalid_input", message: "Details must be valid JSON." });
      return;
    }
    if (String(editMethod.identifier ?? "").toLowerCase() === "mpesa") {
      const phoneNumber = typeof details?.phoneNumber === "string" ? details.phoneNumber.trim() : "";
      if (!phoneNumber) {
        setEditErr({ error: "invalid_input", message: "For mpesa, details.phoneNumber is required." });
        return;
      }
    }

    setEditing(true);
    try {
      const csrf = getCsrfToken();
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (csrf) headers["x-csrf-token"] = csrf;

      const res = await fetch("/api/p2p/payment-methods", {
        method: "PATCH",
        headers,
        credentials: "include",
        body: JSON.stringify({ id: editMethod.id, name, details }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const code = typeof json?.error === "string" ? json.error : `http_${res.status}`;
        setEditErr({ error: code, message: json?.message, details: json?.details });
        return;
      }

      setEditOpen(false);
      await load();
    } catch (e) {
      setEditErr({ error: "internal_error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setEditing(false);
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleteMethod = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    setLoadErr(null);
    try {
      const csrf = getCsrfToken();
      const headers: Record<string, string> = {};
      if (csrf) headers["x-csrf-token"] = csrf;
      const qs = new URLSearchParams({ id });
      const res = await fetch(`/api/p2p/payment-methods?${qs.toString()}`, {
        method: "DELETE",
        headers,
        credentials: "include",
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const code = typeof json?.error === "string" ? json.error : `http_${res.status}`;
        setLoadErr({ error: code, message: json?.message, details: json?.details });
        return;
      }
      await load();
    } catch (e) {
      setLoadErr({ error: "internal_error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setDeletingId(null);
    }
  };

  const loadErrText = errText(loadErr);
  const createErrText = errText(createErr);
  const editErrText = errText(editErr);

  const createParsed = useMemo(() => parseJsonSafe(newDetailsJson), [newDetailsJson]);
  const createRules = useMemo(() => paymentMethodRules(newIdentifier), [newIdentifier]);
  const createMissingRequired = useMemo(() => {
    if (!createParsed.value || typeof createParsed.value !== "object" || Array.isArray(createParsed.value)) {
      return createRules.required;
    }
    const obj = createParsed.value as Record<string, unknown>;
    return createRules.required.filter((key) => {
      const value = obj[key];
      return !(typeof value === "string" ? value.trim() : value);
    });
  }, [createParsed.value, createRules.required]);

  const editParsed = useMemo(() => parseJsonSafe(editDetailsJson), [editDetailsJson]);
  const editRules = useMemo(() => paymentMethodRules(editMethod?.identifier ?? ""), [editMethod?.identifier]);
  const editMissingRequired = useMemo(() => {
    if (!editParsed.value || typeof editParsed.value !== "object" || Array.isArray(editParsed.value)) {
      return editRules.required;
    }
    const obj = editParsed.value as Record<string, unknown>;
    return editRules.required.filter((key) => {
      const value = obj[key];
      return !(typeof value === "string" ? value.trim() : value);
    });
  }, [editParsed.value, editRules.required]);

  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">P2P</div>
            <h1 className="text-2xl font-extrabold tracking-tight">Payment methods</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/v2/p2p"
              className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-2 text-[12px] font-semibold text-[var(--v2-text)]"
            >
              Marketplace
            </Link>
            <Link
              href="/v2/p2p/my-ads"
              className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-2 text-[12px] font-semibold text-[var(--v2-text)]"
            >
              My ads
            </Link>
          </div>
        </div>
        <p className="text-sm text-[var(--v2-muted)]">Your payout methods for SELL ads and receiving fiat.</p>
      </header>

      {loadErrText ? (
        <V2Card>
          <V2CardHeader title={loadErrText.title} subtitle={loadErrText.lines[0]} />
          <V2CardBody>
            {loadErrText.lines.slice(1).length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--v2-muted)]">
                {loadErrText.lines.slice(1).map((l, idx) => (
                  <li key={idx}>{l}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3">
              <V2Button variant="secondary" onClick={() => void load()}>
                Retry
              </V2Button>
            </div>
          </V2CardBody>
        </V2Card>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-[var(--v2-muted)]">{loading ? "Loading…" : `${methods.length} methods`}</div>
        <V2Button variant="primary" onClick={() => openCreate()}>
          Add method
        </V2Button>
      </div>

      {loading ? (
        <div className="grid gap-2">
          <V2Skeleton className="h-20" />
          <V2Skeleton className="h-20" />
        </div>
      ) : methods.length === 0 ? (
        <V2Card>
          <V2CardHeader title="No payment methods" subtitle="Add one to post SELL ads." />
          <V2CardBody>
            <div className="text-sm text-[var(--v2-muted)]">Start with M-Pesa or a bank transfer method.</div>
          </V2CardBody>
        </V2Card>
      ) : (
        <section className="grid gap-2">
          {methods.map((m) => (
            <div
              key={m.id}
              className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3 shadow-[var(--v2-shadow-sm)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-[15px] font-semibold text-[var(--v2-text)]">{String(m.name || m.identifier)}</div>
                    {isVerifiedAgent(m.details) ? (
                      <span className="rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-muted)]">
                        Verified agent
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 truncate text-[12px] text-[var(--v2-muted)]">{String(m.identifier)}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <V2Button variant="secondary" size="sm" onClick={() => openEdit(m)}>
                      Edit
                    </V2Button>
                    <V2Button
                      variant="secondary"
                      size="sm"
                      disabled={deletingId === m.id}
                      onClick={() => void deleteMethod(m.id)}
                    >
                      {deletingId === m.id ? "Deleting…" : "Delete"}
                    </V2Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      <V2Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="Add payment method">
        <div className="space-y-3">
          <V2Input value={newIdentifier} onChange={(e) => setNewIdentifier(e.target.value)} placeholder="Identifier (e.g. mpesa)" />
          <V2Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name/label" />

          <textarea
            value={newDetailsJson}
            onChange={(e) => setNewDetailsJson(e.target.value)}
            placeholder='Details JSON (e.g. {"phoneNumber":"0712345678"})'
            className="min-h-28 w-full resize-y rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-[12px] text-[var(--v2-text)] placeholder:text-[var(--v2-muted)]"
          />

          <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3 text-[12px] text-[var(--v2-muted)]">
            <div className="font-semibold text-[var(--v2-text)]">Validation hints</div>
            <div className="mt-1">Identifier: <span className="font-mono">{String(newIdentifier || "(empty)")}</span></div>
            {createParsed.error ? <div className="mt-1 text-[var(--v2-down)]">{createParsed.error}</div> : null}
            {createRules.required.length > 0 ? (
              <div className="mt-1">
                Required fields: <span className="font-mono">{createRules.required.join(", ")}</span>
              </div>
            ) : null}
            {createMissingRequired.length > 0 ? (
              <div className="mt-1 text-[var(--v2-down)]">Missing required: {createMissingRequired.join(", ")}</div>
            ) : null}
            {createRules.tips.length > 0 ? (
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {createRules.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--v2-muted)]">
            <span>
              Example (mpesa): <span className="font-mono">{"{\"phoneNumber\":\"0712345678\"}"}</span>
            </span>
            <button
              type="button"
              className="rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-2 py-1 text-[11px] font-semibold text-[var(--v2-muted)] hover:bg-[var(--v2-surface)]"
              onClick={() => setNewDetailsJson(exampleMpesa)}
            >
              Use example
            </button>
          </div>

          {createErrText ? (
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3">
              <div className="text-[12px] font-semibold text-[var(--v2-text)]">{createErrText.title}</div>
              <div className="mt-1 text-[12px] text-[var(--v2-down)]">{createErrText.lines[0]}</div>
              {createErrText.lines.slice(1).length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-[var(--v2-down)]">
                  {createErrText.lines.slice(1).map((l, idx) => (
                    <li key={idx}>{l}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <V2Button variant="primary" fullWidth disabled={creating || Boolean(createParsed.error)} onClick={() => void create()}>
            {creating ? "Adding…" : "Add"}
          </V2Button>
        </div>
      </V2Sheet>

      <V2Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit payment method">
        {!editMethod ? (
          <div className="text-sm text-[var(--v2-muted)]">No method selected.</div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3">
              <div className="text-[12px] font-semibold text-[var(--v2-text)]">{String(editMethod.identifier)}</div>
              <div className="mt-1 text-[12px] text-[var(--v2-muted)]">Verified-agent status can’t be edited here.</div>
            </div>

            <V2Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name/label" />

            <textarea
              value={editDetailsJson}
              onChange={(e) => setEditDetailsJson(e.target.value)}
              placeholder='Details JSON'
              className="min-h-28 w-full resize-y rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-[12px] text-[var(--v2-text)] placeholder:text-[var(--v2-muted)]"
            />

            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3 text-[12px] text-[var(--v2-muted)]">
              <div className="font-semibold text-[var(--v2-text)]">Validation hints</div>
              <div className="mt-1">Identifier: <span className="font-mono">{String(editMethod.identifier || "(empty)")}</span></div>
              {editParsed.error ? <div className="mt-1 text-[var(--v2-down)]">{editParsed.error}</div> : null}
              {editRules.required.length > 0 ? (
                <div className="mt-1">
                  Required fields: <span className="font-mono">{editRules.required.join(", ")}</span>
                </div>
              ) : null}
              {editMissingRequired.length > 0 ? (
                <div className="mt-1 text-[var(--v2-down)]">Missing required: {editMissingRequired.join(", ")}</div>
              ) : null}
              {editRules.tips.length > 0 ? (
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {editRules.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            {editErrText ? (
              <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3">
                <div className="text-[12px] font-semibold text-[var(--v2-text)]">{editErrText.title}</div>
                <div className="mt-1 text-[12px] text-[var(--v2-down)]">{editErrText.lines[0]}</div>
                {editErrText.lines.slice(1).length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-[var(--v2-down)]">
                    {editErrText.lines.slice(1).map((l, idx) => (
                      <li key={idx}>{l}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <V2Button variant="primary" fullWidth disabled={editing || Boolean(editParsed.error)} onClick={() => void saveEdit()}>
              {editing ? "Saving…" : "Save"}
            </V2Button>
          </div>
        )}
      </V2Sheet>
    </main>
  );
}
