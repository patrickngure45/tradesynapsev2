export type ApiErrorPayload = {
  error?: string;
  message?: string;
  details?: unknown;
  _raw?: unknown;
};

export class ApiError extends Error {
  code: string;
  details?: unknown;
  status?: number;
  requestId?: string;

  constructor(code: string, opts?: { details?: unknown; status?: number; requestId?: string }) {
    const msg = opts?.requestId ? `${code} (req ${opts.requestId})` : code;
    super(msg);
    this.name = "ApiError";
    this.code = code;
    this.details = opts?.details;
    this.status = opts?.status;
    this.requestId = opts?.requestId;
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { _raw: text };
  }
}

function looksLikeHtml(text: string): boolean {
  const s = String(text ?? "").trimStart();
  return s.startsWith("<!DOCTYPE html") || s.startsWith("<html") || s.startsWith("<!doctype html");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, Math.floor(ms))));
}

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return match?.[1] ?? null;
}

export async function fetchJsonOrThrow<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const mergedInit: RequestInit | undefined = init
    ? ({
        ...init,
        credentials: init.credentials ?? "same-origin",
      } as RequestInit)
    : ({ credentials: "same-origin" } as RequestInit);

  // Attach CSRF double-submit token on mutating requests
  const method = (mergedInit?.method ?? "GET").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) {
      const headers = new Headers(mergedInit?.headers);
      if (!headers.has("x-csrf-token")) {
        headers.set("x-csrf-token", csrf);
      }
      mergedInit!.headers = headers;
    }
  }

  const method0 = (mergedInit?.method ?? "GET").toUpperCase();
  const canRetry = method0 === "GET" || method0 === "HEAD";
  const maxRetries = canRetry ? 2 : 0;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const res = await fetch(input, mergedInit);
      const requestId = res.headers.get("x-request-id") ?? undefined;
      const text = await res.text().catch(() => "");
      const contentType = res.headers.get("content-type") ?? "";
      const isHtml = contentType.includes("text/html") || looksLikeHtml(text);
      const json = (isHtml ? { _raw: "<html/>" } : safeJsonParse(text)) as ApiErrorPayload | unknown;

      if (!res.ok) {
        // Retry transient upstream errors for idempotent requests.
        if (canRetry && (res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxRetries) {
          await sleep(250 * Math.pow(2, attempt));
          continue;
        }

        if (json && typeof json === "object" && "error" in (json as ApiErrorPayload)) {
          const payload = json as ApiErrorPayload;
          const code = typeof payload.error === "string" ? payload.error : `http_${res.status}`;
          const details =
            payload.details !== undefined
              ? payload.details
              : typeof payload.message === "string"
                ? payload.message
                : isHtml
                  ? { message: `Upstream error (HTTP ${res.status}). Please retry.` }
                  : undefined;
          throw new ApiError(code, { details, status: res.status, requestId });
        }

        if (json && typeof json === "object" && "message" in (json as ApiErrorPayload)) {
          const payload = json as ApiErrorPayload;
          const details = typeof payload.message === "string" ? payload.message : json;
          throw new ApiError(`http_${res.status}`, { details, status: res.status, requestId });
        }

        const details = isHtml ? { message: `Upstream error (HTTP ${res.status}). Please retry.` } : json;
        throw new ApiError(`http_${res.status}`, { details, status: res.status, requestId });
      }

      return json as T;
    } catch (e) {
      lastErr = e;
      // Retry network errors on idempotent requests.
      if (canRetry && attempt < maxRetries) {
        await sleep(250 * Math.pow(2, attempt));
        continue;
      }
      throw e;
    }
  }

  throw lastErr;
}
