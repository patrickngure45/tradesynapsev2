"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { readActingUserIdPreference } from "@/lib/state/actingUser";
import { copyToClipboard } from "@/lib/ui/copyToClipboard";
import { Toast, type ToastKind } from "@/components/Toast";

function isUuid(value: string): boolean {
  const v = value.trim();
  // Simple UUID v1-v5 match.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function extractUuid(text: string): string | null {
  const match = text.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
  );
  return match ? match[0] : null;
}

export function TradeLinkBuilderClient() {
  const [tradeId, setTradeId] = useState<string>("");
  const [includeUserId, setIncludeUserId] = useState(true);
  const [actingUserId, setActingUserId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return readActingUserIdPreference() ?? "";
  });

  const [shell, setShell] = useState<"bash" | "powershell">("powershell");

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<ToastKind>("info");

  const trimmedTradeId = tradeId.trim();
  const tradeOk = useMemo(() => isUuid(trimmedTradeId), [trimmedTradeId]);

  const userIdParam = includeUserId && actingUserId ? `?user_id=${encodeURIComponent(actingUserId)}` : "";

  const uiHref = tradeOk ? `/trades/${trimmedTradeId}${userIdParam}` : "";
  const apiBase = tradeOk ? `/api/trades/${trimmedTradeId}` : "";

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const headerNeeded = Boolean(actingUserId);

  const apiTradeUrl = tradeOk ? `${origin}${apiBase}` : "";
  const apiEvidenceUrl = tradeOk ? `${origin}${apiBase}/evidence${userIdParam}` : "";
  const apiRiskUrl = tradeOk ? `${origin}${apiBase}/risk${userIdParam}` : "";
  const apiProofPackUrl = tradeOk ? `${origin}${apiBase}/proof-pack${userIdParam}` : "";

  const headerBash = headerNeeded ? `-H 'x-user-id: ${actingUserId}'` : "";
  const headerPwsh = headerNeeded ? `-H \"x-user-id: ${actingUserId}\"` : "";

  const cmdTrade =
    shell === "bash"
      ? `curl -sS ${headerBash} '${apiTradeUrl}'`
      : `curl.exe -sS ${headerPwsh} \"${apiTradeUrl}\"`;

  const cmdEvidence =
    shell === "bash"
      ? `curl -sS ${headerBash} '${apiEvidenceUrl}'`
      : `curl.exe -sS ${headerPwsh} \"${apiEvidenceUrl}\"`;

  const cmdRisk =
    shell === "bash"
      ? `curl -sS ${headerBash} '${apiRiskUrl}'`
      : `curl.exe -sS ${headerPwsh} \"${apiRiskUrl}\"`;

  const cmdProofPack =
    shell === "bash"
      ? `curl -L ${headerBash} -o 'proofpack-${trimmedTradeId}.zip' '${apiProofPackUrl}'`
      : `Invoke-WebRequest -Headers @{ 'x-user-id' = '${actingUserId}' } -Uri \"${apiProofPackUrl}\" -OutFile \"proofpack-${trimmedTradeId}.zip\"`;

  const cmdProofPackFallback =
    shell === "bash"
      ? null
      : `curl.exe -L ${headerPwsh} -o \"proofpack-${trimmedTradeId}.zip\" \"${apiProofPackUrl}\"`;

  async function copyAbsolute(href: string) {
    try {
      const absolute = new URL(href, window.location.origin).toString();
      const ok = await copyToClipboard(absolute);
      setToastKind(ok ? "success" : "error");
      setToastMessage(ok ? "Link copied." : "Copy failed.");
    } catch {
      setToastKind("error");
      setToastMessage("Copy failed.");
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      const extracted = extractUuid(text ?? "");
      if (!extracted) {
        setToastKind("error");
        setToastMessage("Clipboard doesn’t contain a trade ID.");
        return;
      }
      setTradeId(extracted);
      setToastKind("success");
      setToastMessage("Trade ID pasted.");
    } catch {
      setToastKind("error");
      setToastMessage("Paste failed (clipboard permission?).");
    }
  }

  async function copyTradeId() {
    if (!tradeOk) return;
    try {
      const ok = await copyToClipboard(trimmedTradeId);
      setToastKind(ok ? "success" : "error");
      setToastMessage(ok ? "Trade ID copied." : "Copy failed.");
    } catch {
      setToastKind("error");
      setToastMessage("Copy failed.");
    }
  }

  async function copyCommand(text: string) {
    try {
      const ok = await copyToClipboard(text);
      setToastKind(ok ? "success" : "error");
      setToastMessage(ok ? "Command copied." : "Copy failed.");
    } catch {
      setToastKind("error");
      setToastMessage("Copy failed.");
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <Toast message={toastMessage} kind={toastKind} onDone={() => setToastMessage(null)} />

      <h2 className="text-lg font-medium">Jump to a trade</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Paste a trade ID (or any trade link) to generate real UI/API links.
      </p>

      <div className="mt-4 grid gap-3">
        <div className="grid gap-1 text-sm">
          <span className="text-zinc-500">Trade ID (UUID)</span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={tradeId}
              onChange={(e) => setTradeId(e.target.value)}
              placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
              className="min-w-[16rem] flex-1 rounded border border-zinc-200 bg-transparent px-3 py-2 font-mono text-xs dark:border-zinc-800"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="rounded border border-zinc-200 px-2 py-2 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
              onClick={() => void pasteFromClipboard()}
            >
              Paste
            </button>
            <button
              type="button"
              className="rounded border border-zinc-200 px-2 py-2 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
              onClick={() => setTradeId("")}
              disabled={!tradeId}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={includeUserId}
              onChange={(e) => setIncludeUserId(e.target.checked)}
            />
            Include acting user_id
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-zinc-500">Acting user_id</span>
            <input
              value={actingUserId}
              onChange={(e) => setActingUserId(e.target.value)}
              placeholder="(optional)"
              className="w-[28rem] max-w-full rounded border border-zinc-200 bg-transparent px-3 py-2 font-mono text-xs dark:border-zinc-800"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-zinc-500">Shell</span>
            <select
              className="rounded border border-zinc-200 bg-transparent px-2 py-2 text-xs dark:border-zinc-800"
              value={shell}
              onChange={(e) => setShell(e.target.value as "bash" | "powershell")}
            >
              <option value="powershell">PowerShell</option>
              <option value="bash">Bash</option>
            </select>
          </label>
        </div>

        {!tradeId.trim() ? null : tradeOk ? null : (
          <div className="text-sm text-amber-700 dark:text-amber-300">That doesn’t look like a UUID.</div>
        )}

        {tradeOk ? (
          <div className="grid gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <Link className="underline" href={uiHref}>
                Open Trade UI
              </Link>
              <button
                type="button"
                className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                onClick={() => void copyAbsolute(uiHref)}
              >
                Copy link
              </button>
              <button
                type="button"
                className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                onClick={() => void copyTradeId()}
              >
                Copy ID
              </button>
            </div>

            <div className="mt-2 grid gap-1">
              <div className="flex flex-wrap items-center gap-3">
                <Link className="underline" href={apiBase}>
                  GET {apiBase}
                </Link>
                <button
                  type="button"
                  className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                  onClick={() => void copyAbsolute(apiBase)}
                >
                  Copy
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link className="underline" href={`${apiBase}/evidence${userIdParam}`}>
                  GET {apiBase}/evidence
                </Link>
                <button
                  type="button"
                  className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                  onClick={() => void copyAbsolute(`${apiBase}/evidence${userIdParam}`)}
                >
                  Copy
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link className="underline" href={`${apiBase}/risk${userIdParam}`}>
                  GET {apiBase}/risk
                </Link>
                <button
                  type="button"
                  className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                  onClick={() => void copyAbsolute(`${apiBase}/risk${userIdParam}`)}
                >
                  Copy
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link className="underline" href={`${apiBase}/proof-pack${userIdParam}`}>
                  GET {apiBase}/proof-pack
                </Link>
                <button
                  type="button"
                  className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                  onClick={() => void copyAbsolute(`${apiBase}/proof-pack${userIdParam}`)}
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              <div className="text-sm font-medium">Terminal commands</div>
              {!actingUserId ? (
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  Note: production requires an acting user (session cookie or{" "}
                  <span className="font-mono">x-user-id</span>). Add an acting user_id to include the header in generated commands.
                </div>
              ) : null}

              <div className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-zinc-500">Fetch trade JSON</div>
                  <button
                    type="button"
                    className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                    onClick={() => void copyCommand(cmdTrade)}
                  >
                    Copy
                  </button>
                </div>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-zinc-800 dark:text-zinc-200">{cmdTrade}</pre>
              </div>

              <div className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-zinc-500">Fetch evidence list</div>
                  <button
                    type="button"
                    className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                    onClick={() => void copyCommand(cmdEvidence)}
                  >
                    Copy
                  </button>
                </div>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-zinc-800 dark:text-zinc-200">{cmdEvidence}</pre>
              </div>

              <div className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-zinc-500">Fetch latest risk</div>
                  <button
                    type="button"
                    className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                    onClick={() => void copyCommand(cmdRisk)}
                  >
                    Copy
                  </button>
                </div>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-zinc-800 dark:text-zinc-200">{cmdRisk}</pre>
              </div>

              <div className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-zinc-500">Download proof pack ZIP</div>
                  <button
                    type="button"
                    className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                    onClick={() => void copyCommand(cmdProofPack)}
                  >
                    Copy
                  </button>
                </div>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-zinc-800 dark:text-zinc-200">{cmdProofPack}</pre>
                {cmdProofPackFallback ? (
                  <div className="mt-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] text-zinc-500">Alternative (uses curl.exe)</div>
                      <button
                        type="button"
                        className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                        onClick={() => void copyCommand(cmdProofPackFallback)}
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-zinc-800 dark:text-zinc-200">{cmdProofPackFallback}</pre>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
