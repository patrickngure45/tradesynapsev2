type CronRequestLike = {
  headers: {
    get(name: string): string | null;
  };
  url: string;
};

function firstNonEmpty(values: Array<string | null | undefined>): string {
  for (const raw of values) {
    const value = String(raw ?? "").trim();
    if (value) return value;
  }
  return "";
}

function getHeader(request: CronRequestLike, name: string): string {
  return String(request.headers.get(name) ?? "").trim();
}

function getClientIp(request: CronRequestLike): string {
  const xForwardedFor = getHeader(request, "x-forwarded-for");
  const forwardedIp = xForwardedFor
    ? xForwardedFor
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)[0] ?? ""
    : "";

  return firstNonEmpty([
    getHeader(request, "x-real-ip"),
    getHeader(request, "cf-connecting-ip"),
    forwardedIp,
  ]);
}

function getEnv(keys: string[]): string {
  for (const key of keys) {
    const value = String(process.env[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

export function requireCronRequestAuth(
  request: CronRequestLike,
  options?: {
    allowInNonProd?: boolean;
    secretEnvKeys?: string[];
    allowlistEnvKeys?: string[];
  },
): string | null {
  const allowInNonProd = options?.allowInNonProd ?? true;
  if (allowInNonProd && process.env.NODE_ENV !== "production") return null;

  const secret = getEnv(options?.secretEnvKeys ?? ["EXCHANGE_CRON_SECRET", "CRON_SECRET"]);
  if (!secret) return "cron_secret_not_configured";

  const url = new URL(request.url);
  const provided = firstNonEmpty([request.headers.get("x-cron-secret"), url.searchParams.get("secret")]);
  if (!provided || provided !== secret) return "cron_unauthorized";

  const allowlistRaw = getEnv(options?.allowlistEnvKeys ?? ["EXCHANGE_CRON_ALLOWED_IPS", "CRON_ALLOWED_IPS"]);
  if (!allowlistRaw) return null;

  const allowlist = new Set(
    allowlistRaw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );

  if (allowlist.size === 0) return null;

  const ip = getClientIp(request);
  if (!ip || !allowlist.has(ip)) return "cron_unauthorized";

  return null;
}
