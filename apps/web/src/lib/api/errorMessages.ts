export type ClientErrorInfo = {
  title: string;
  message: string;
  code: string;
};

export function formatClientErrorDetails(details: unknown): string[] | null {
  if (!details) return null;

  // Zod issues shape: Array<{ path: (string|number)[], message: string }>
  if (Array.isArray(details)) {
    const lines: string[] = [];
    for (const item of details) {
      if (!item || typeof item !== "object") continue;
      const path = (item as { path?: unknown }).path;
      const message = (item as { message?: unknown }).message;
      const pathStr = Array.isArray(path)
        ? path.map((p) => String(p)).filter(Boolean).join(".")
        : "";
      const msgStr = typeof message === "string" ? message : null;
      if (!msgStr) continue;
      lines.push(pathStr ? `${pathStr}: ${msgStr}` : msgStr);
    }
    return lines.length ? lines : null;
  }

  if (typeof details === "string") return [details];

  if (details && typeof details === "object") {
    const obj = details as Record<string, unknown>;
    const lines: string[] = [];

    const message = typeof obj.message === "string" ? obj.message : null;
    const error = typeof obj.error === "string" ? obj.error : null;
    if (message) lines.push(message);
    if (error && error !== message) lines.push(`error: ${error}`);

    if (lines.length > 0) return lines;
  }

  try {
    return [JSON.stringify(details, null, 2)];
  } catch {
    return [String(details)];
  }
}

function httpMessage(code: string): ClientErrorInfo {
  const m = code.match(/^http_(\d{3})$/);
  if (!m) {
    return { title: "Request failed", message: "Request failed.", code };
  }

  const status = Number(m[1]);
  if (status === 401) {
    return {
      title: "Unauthorized",
      message: "You are not authenticated for this action.",
      code,
    };
  }
  if (status === 403) {
    return {
      title: "Forbidden",
      message: "You are not allowed to perform this action.",
      code,
    };
  }
  if (status === 404) {
    return {
      title: "Not found",
      message: "The requested resource was not found.",
      code,
    };
  }
  if (status === 409) {
    return {
      title: "Conflict",
      message: "The request conflicts with current state.",
      code,
    };
  }

  return {
    title: "Request failed",
    message: `Request failed with HTTP ${status}.`,
    code,
  };
}

const CODE_MAP: Record<string, Omit<ClientErrorInfo, "code">> = {
  // Local UI guards
  missing_acting_user_id: {
    title: "Select an acting user",
    message: "Pick an acting user first (scopes the trade list).",
  },
  missing_or_invalid_users: {
    title: "Select buyer and seller",
    message: "Choose a buyer and a different seller before creating a trade.",
  },
  missing_file: {
    title: "Missing file",
    message: "Choose a file to upload.",
  },
  missing_submitted_by_user_id: {
    title: "Missing submitter",
    message: "Pick who is submitting this evidence.",
  },
  missing_opened_by_user_id: {
    title: "Missing opener",
    message: "Pick who is opening the dispute.",
  },
  missing_decided_by: {
    title: "Missing reviewer identity",
    message: "Enter a reviewer identity (decided_by).",
  },

  // Auth / identity
  missing_x_user_id: {
    title: "Missing acting user",
    message: "This endpoint requires an acting user (session cookie or x-user-id).",
  },
  missing_user_id: {
    title: "Missing acting user",
    message: "Provide an acting user (session cookie, x-user-id, or user_id).",
  },
  session_user_mismatch: {
    title: "Signed-in user mismatch",
    message: "Your session is signed in as a different user. Sign in as the user for this action, or switch to header auth.",
  },
  x_user_id_mismatch: {
    title: "Acting user mismatch",
    message: "The acting user does not match the user for this action.",
  },
  user_not_found: {
    title: "User not found",
    message: "That user id does not exist.",
  },
  user_not_active: {
    title: "User not active",
    message: "That user is not active and cannot act on trades.",
  },
  not_party: {
    title: "Not a party",
    message: "Only the buyer or seller can access this trade.",
  },
  opened_by_not_party: {
    title: "Not a party",
    message: "Only the buyer or seller can open a dispute.",
  },
  actor_not_allowed: {
    title: "Not allowed",
    message: "The signed-in user is not allowed to perform this action.",
  },

  p2p_country_not_supported: {
    title: "Country not supported",
    message: "P2P is not available in your country yet.",
  },

  // Not found
  not_found: {
    title: "Not found",
    message: "The requested resource was not found.",
  },
  trade_not_found: {
    title: "Trade not found",
    message: "That trade id was not found.",
  },
  trade_transition_not_allowed: {
    title: "Invalid transition",
    message: "That action is not allowed for the trade's current status.",
  },
  trade_not_cancelable: {
    title: "Cannot cancel",
    message: "This trade can't be canceled in its current state. If it's disputed, resolve it via a reviewer decision.",
  },
  dispute_not_found: {
    title: "Dispute not found",
    message: "No dispute exists for this trade.",
  },

  // Validation
  invalid_input: {
    title: "Invalid input",
    message: "Some fields were invalid. Check your inputs and try again.",
  },

  // Server
  internal_error: {
    title: "Server error",
    message: "The server hit an unexpected error. Try again in a moment.",
  },

  // Dependencies
  upstream_unavailable: {
    title: "Service unavailable",
    message: "A required dependency is unavailable (typically the database). Try again shortly.",
  },
  invalid_metadata_json: {
    title: "Invalid metadata",
    message: "Metadata JSON must be a valid JSON object.",
  },
  unsupported_version: {
    title: "Unsupported version",
    message: "That API version is not supported.",
  },

  // State machine / conflicts
  dispute_already_exists: {
    title: "Dispute already exists",
    message: "This trade already has a dispute.",
  },
  trade_not_disputable: {
    title: "Trade not disputable",
    message: "This trade can't be disputed in its current state.",
  },
  dispute_not_open: {
    title: "Dispute not open",
    message: "This dispute is not open (already resolved or closed).",
  },
  trade_not_resolvable: {
    title: "Trade not resolvable",
    message: "This trade can't be resolved from dispute in its current state.",
  },
  trade_not_disputed: {
    title: "Trade not in dispute",
    message: "This decision requires the trade to be in the disputed state.",
  },
  trade_state_conflict: {
    title: "State changed",
    message: "The trade/dispute state changed while processing. Refresh and try again.",
  },

  // Exchange / ledger
  insufficient_balance: {
    title: "Insufficient balance",
    message: "You don't have enough available balance for this action.",
  },

  recipient_not_found: {
    title: "Recipient not found",
    message: "No user exists with that email. Check for typos and try again.",
  },
  recipient_inactive: {
    title: "Recipient unavailable",
    message: "That recipient account is not active and cannot receive transfers.",
  },
  recipient_same_as_sender: {
    title: "Invalid recipient",
    message: "You cannot send a transfer to yourself.",
  },

  transfer_not_found: {
    title: "Transfer not found",
    message: "That transfer could not be found.",
  },
  transfer_not_reversible: {
    title: "Transfer not reversible",
    message: "This transfer cannot be reversed automatically.",
  },
  transfer_already_reversed: {
    title: "Already reversed",
    message: "This transfer has already been reversed.",
  },
  recipient_insufficient_balance_for_reversal: {
    title: "Cannot reverse transfer",
    message: "The recipient no longer has enough available balance to reverse this transfer.",
  },

  withdrawal_address_not_allowlisted: {
    title: "Address not allowlisted",
    message: "Withdrawals are allowlist-only. Add this destination address to your allowlist first.",
  },

  // Reviewer gating
  reviewer_key_invalid: {
    title: "Reviewer key invalid",
    message: "Provide the correct reviewer key (x-reviewer-key).",
  },
  reviewer_key_not_configured: {
    title: "Reviewer key not configured",
    message: "Server is missing reviewer key configuration.",
  },

  admin_key_invalid: {
    title: "Admin key invalid",
    message: "Provide the correct admin key (x-admin-key).",
  },
  admin_key_not_configured: {
    title: "Admin key not configured",
    message: "Server is missing exchange admin key configuration.",
  },

  // Session auth bootstrap
  session_secret_not_configured: {
    title: "Session not configured",
    message: "Server is missing PROOFPACK_SESSION_SECRET.",
  },
  session_bootstrap_not_configured: {
    title: "Bootstrap not configured",
    message: "Server is missing PROOFPACK_SESSION_BOOTSTRAP_KEY.",
  },
  session_bootstrap_key_invalid: {
    title: "Unauthorized",
    message: "Missing or invalid session bootstrap key.",
  },

  // Trade creation specifics
  buyer_not_found: {
    title: "Buyer not found",
    message: "The buyer user id does not exist.",
  },
  seller_not_found: {
    title: "Seller not found",
    message: "The seller user id does not exist.",
  },
  buyer_not_active: {
    title: "Buyer not active",
    message: "The buyer user is not active.",
  },
  seller_not_active: {
    title: "Seller not active",
    message: "The seller user is not active.",
  },

  // Generic client fallbacks
  load_failed: {
    title: "Load failed",
    message: "Failed to load this page. Try again.",
  },
  refresh_failed: {
    title: "Refresh failed",
    message: "Failed to refresh data. Try again.",
  },
  create_trade_failed: {
    title: "Create trade failed",
    message: "Failed to create the trade. Try again.",
  },
  users_failed: {
    title: "Load users failed",
    message: "Failed to load users. Try again.",
  },
  upload_failed: {
    title: "Upload failed",
    message: "Failed to upload evidence. Try again.",
  },
  evacuation_failed: {
    title: "Add funds failed",
    message: "Could not pull funds from connected exchanges. Check connection status and try again.",
  },
  open_dispute_failed: {
    title: "Open dispute failed",
    message: "Failed to open dispute. Try again.",
  },
  submit_decision_failed: {
    title: "Submit decision failed",
    message: "Failed to submit reviewer decision. Try again.",
  },
  risk_failed: {
    title: "Risk assessment failed",
    message: "Failed to run risk assessment. Try again.",
  },

  // Rate limiting
  rate_limit_exceeded: {
    title: "Too many requests",
    message: "You're sending too many requests. Please wait a moment and try again.",
  },

  // Session expiry
  session_token_expired: {
    title: "Session expired",
    message: "Your session has expired. Please sign in again.",
  },

  // Dispute state machine
  dispute_transition_not_allowed: {
    title: "Invalid dispute transition",
    message: "That action is not allowed for the dispute's current status.",
  },

  // Exchange - order/market
  order_not_found: {
    title: "Order not found",
    message: "That order id was not found.",
  },
  market_not_found: {
    title: "Market not found",
    message: "That market was not found.",
  },
  market_disabled: {
    title: "Market disabled",
    message: "This market is currently disabled for trading.",
  },
  order_state_conflict: {
    title: "Order state changed",
    message: "The order's state changed while processing. Refresh and try again.",
  },
  price_not_multiple_of_tick: {
    title: "Invalid price",
    message: "Price must be a multiple of the market's tick size.",
  },
  quantity_not_multiple_of_lot: {
    title: "Invalid quantity",
    message: "Quantity must be a multiple of the market's lot size.",
  },
  withdrawal_risk_blocked: {
    title: "Withdrawal blocked",
    message: "This withdrawal was flagged by risk controls. Contact support if you believe this is an error.",
  },
};

export function describeClientError(code: string): ClientErrorInfo {
  const trimmed = (code ?? "").trim();
  if (!trimmed) {
    return { title: "Error", message: "Something went wrong.", code: "unknown" };
  }

  if (trimmed.startsWith("http_")) {
    return httpMessage(trimmed);
  }

  const mapped = CODE_MAP[trimmed];
  if (mapped) return { ...mapped, code: trimmed };

  const short = trimmed.length > 180 ? trimmed.slice(0, 180) + "…" : trimmed;
  return { title: "Error", message: short, code: trimmed };

}


