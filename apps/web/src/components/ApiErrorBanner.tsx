"use client";

import { useMemo, useState } from "react";

import { describeClientError, formatClientErrorDetails } from "@/lib/api/errorMessages";

export type ClientApiError = { code: string; details?: unknown };

export function ApiErrorBanner({
  error,
  onRetry,
  className,
}: {
  error: ClientApiError | null;
  onRetry?: () => void;
  className?: string;
}) {
  const [expandedErrorCode, setExpandedErrorCode] = useState<string | null>(null);

  const info = useMemo(() => (error ? describeClientError(error.code) : null), [error]);
  const details = useMemo(
    () => (error ? formatClientErrorDetails(error.details) : null),
    [error]
  );

  if (!info) return null;

  const baseClassName =
    "rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200";
  const mergedClassName = className ? `${baseClassName} ${className}` : baseClassName;

  const showAllDetails = Boolean(error && expandedErrorCode === error.code);

  return (
    <div className={mergedClassName}>
      <div className="font-semibold">{info.title}</div>
      <div className="mt-1">{info.message}</div>

      {details ? (
        <div className="mt-2 rounded border border-red-200 bg-white/50 p-2 text-xs dark:border-red-900/50 dark:bg-black/20">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold">Details</div>
            {details.length > 6 ? (
              <button
                type="button"
                className="text-xs underline"
                onClick={() => {
                  if (!error) return;
                  setExpandedErrorCode((prev) => (prev === error.code ? null : error.code));
                }}
              >
                {showAllDetails ? "Show less" : `Show all (${details.length})`}
              </button>
            ) : null}
          </div>
          <ul className="mt-1 list-disc pl-5">
            {(showAllDetails ? details : details.slice(0, 6)).map((line, i) => (
              <li key={i} className="whitespace-pre-wrap break-words font-mono">
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-2 font-mono text-xs opacity-80">{info.code}</div>

      {onRetry ? (
        <button
          type="button"
          className="mt-3 rounded bg-zinc-900 px-3 py-2 text-white dark:bg-zinc-100 dark:text-black"
          onClick={onRetry}
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
