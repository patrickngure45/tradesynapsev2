"use client";

import { useEffect, useMemo, useState } from "react";

function readLastRequestId(): string {
  try {
    return window.sessionStorage.getItem("ts.last_request_id") ?? "";
  } catch {
    return "";
  }
}

export function LastRequestIdCard({ compact }: { compact?: boolean }) {
  const [rid, setRid] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setRid(readLastRequestId());
    const t = setInterval(() => setRid(readLastRequestId()), 1500);
    return () => clearInterval(t);
  }, []);

  const display = useMemo(() => {
    const v = String(rid ?? "").trim();
    if (!v) return "—";
    return v;
  }, [rid]);

  const copy = async () => {
    const v = String(rid ?? "").trim();
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  return (
    <div className={
      compact
        ? "rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
        : "rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
    }>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-[var(--foreground)]">Support request id</div>
          <div className="mt-1 text-[11px] text-[var(--muted)]">
            If something errors, include this id when contacting support.
          </div>
        </div>
        <button
          type="button"
          onClick={copy}
          disabled={!rid.trim()}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--card-2)] disabled:opacity-60"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-xs text-[var(--foreground)]">
        {display}
      </div>

      <div className="mt-2 text-[10px] text-[var(--muted)]">
        This updates automatically after API calls.
      </div>
    </div>
  );
}
