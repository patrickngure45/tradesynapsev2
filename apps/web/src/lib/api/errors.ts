import { ZodError } from "zod";

export type ApiErrorResponse = {
  error: string;
  details?: unknown;
};

export function statusForApiError(code: string): number {
  switch (code) {
    // AuthN
    case "missing_x_user_id":
    case "missing_user_id":
    case "reviewer_key_invalid":
    case "session_bootstrap_key_invalid":
    case "admin_key_invalid":
    case "session_token_expired":
      return 401;

    // AuthZ
    case "not_party":
    case "opened_by_not_party":
    case "x_user_id_mismatch":
    case "actor_not_allowed":
    case "withdrawal_address_not_allowlisted":
    case "user_not_active":
    case "buyer_not_active":
    case "seller_not_active":
      return 403;

    // Not found
    case "not_found":
    case "trade_not_found":
    case "dispute_not_found":
    case "user_not_found":
    case "market_not_found":
    case "order_not_found":
      return 404;

    // Conflict / state machine
    case "trade_not_disputable":
    case "trade_not_disputed":
    case "trade_not_resolvable":
    case "dispute_not_open":
    case "dispute_already_exists":
    case "dispute_transition_not_allowed":
    case "trade_transition_not_allowed":
    case "trade_not_cancelable":
    case "trade_state_conflict":
    case "insufficient_balance":
    case "order_state_conflict":
    case "market_disabled":
    case "withdrawal_risk_blocked":
      return 409;

    // Rate limiting
    case "rate_limit_exceeded":
      return 429;

    // Validation
    case "invalid_input":
    case "price_not_multiple_of_tick":
    case "quantity_not_multiple_of_lot":
    case "unsupported_version":
    case "missing_file":
    case "invalid_metadata_json":
    case "buyer_not_found":
    case "seller_not_found":
      return 400;

    // Server misconfig
    case "reviewer_key_not_configured":
    case "session_secret_not_configured":
    case "session_bootstrap_not_configured":
    case "admin_key_not_configured":
      return 500;

    // Upstream / dependencies
    case "upstream_unavailable":
      return 503;

    default:
      return 400;
  }
}

export function apiError(
  code: string,
  init?: {
    status?: number;
    details?: unknown;
    headers?: HeadersInit;
  }
): Response {
  const status = init?.status ?? statusForApiError(code);
  
  // Ensure message is included if details is just a string, or if we can extract it.
  // But strictly, we should output { error: code, message?: string, details?: any }
  // The UI expects `message`.
  const body: any = { error: code };
  
  if (typeof init?.details === 'string') {
      body.message = init.details;
      body.details = init.details;
  } else if (typeof init?.details === 'object' && init?.details !== null) {
      body.details = init.details;
      if ('message' in init.details) {
          body.message = (init.details as any).message;
      }
  }

  const headers = init?.headers ? new Headers(init.headers) : new Headers();
  if (code === "upstream_unavailable" && !headers.has("Retry-After")) {
    headers.set("Retry-After", "3");
  }

  return Response.json(body, { status, headers });
}

export function apiZodError(err: unknown): Response | null {
  if (!(err instanceof ZodError)) return null;
  return apiError("invalid_input", { status: 400, details: err.issues });
}

export function apiUpstreamUnavailable(
  details?: unknown,
  init?: {
    retryAfterSeconds?: number;
  }
): Response {
  const headers: HeadersInit | undefined =
    typeof init?.retryAfterSeconds === "number"
      ? { "Retry-After": String(Math.max(0, Math.floor(init.retryAfterSeconds))) }
      : undefined;

  return apiError("upstream_unavailable", {
    status: 503,
    details,
    headers,
  });
}
