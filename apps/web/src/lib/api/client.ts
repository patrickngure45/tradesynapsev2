export type ApiErrorPayload = {
  error?: string;
  details?: unknown;
  _raw?: unknown;
};

export class ApiError extends Error {
  code: string;
  details?: unknown;
  status?: number;

  constructor(code: string, opts?: { details?: unknown; status?: number }) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.details = opts?.details;
    this.status = opts?.status;
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { _raw: text };
  }
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

  const res = await fetch(input, mergedInit);
  const text = await res.text().catch(() => "");
  const json = safeJsonParse(text) as ApiErrorPayload | unknown;

  if (!res.ok) {
    if (json && typeof json === "object" && "error" in (json as ApiErrorPayload)) {
      const payload = json as ApiErrorPayload;
      const code = typeof payload.error === "string" ? payload.error : `http_${res.status}`;
      throw new ApiError(code, { details: payload.details, status: res.status });
    }

    throw new ApiError(`http_${res.status}`, { details: json, status: res.status });
  }

  return json as T;
}
