/*
Lightweight smoke-test utilities shared by scripts/smoke-*.ts.

Auth modes supported:
- COOKIE: full Cookie header containing pp_session and __csrf
- PP_SESSION + CSRF: constructs Cookie header
- INTERNAL_SERVICE_SECRET + SMOKE_USER_ID: internal token (if enabled server-side)
- X_USER_ID: dev-only header (may not work for session-guarded routes)
*/

export type Json = any;

type ChildProc = import("node:child_process").ChildProcess;

export type AuthMode = "cookie" | "session" | "internal" | "x-user-id" | "none";

export type AuthHeaders = {
  mode: AuthMode;
  headers: Record<string, string>;
  csrfToken: string | null;
};

type CookieJar = Map<string, string>;

export function requiredEnv(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function optEnv(name: string): string | null {
  const v = (process.env[name] ?? "").trim();
  return v ? v : null;
}

export function baseUrl(): string {
  return (process.env.BASE ?? "http://localhost:3000").trim().replace(/\/$/, "");
}

export function baseOrigin(): string {
  return new URL(baseUrl()).origin;
}

export function defaultReferer(): string {
  return `${baseOrigin()}/v2`;
}

function isMutatingMethod(method: string | undefined): boolean {
  const m = (method ?? "GET").toUpperCase();
  return m !== "GET" && m !== "HEAD" && m !== "OPTIONS";
}

export function buildHeaders(
  auth: AuthHeaders,
  method: string,
  extra?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    ...auth.headers,
    ...(extra ?? {}),
  };

  if (isMutatingMethod(method)) {
    headers.origin = baseOrigin();
    headers.referer = defaultReferer();
    if (auth.csrfToken) headers["x-csrf-token"] = auth.csrfToken;
    // Many routes accept JSON bodies.
    if (!headers["content-type"]) headers["content-type"] = "application/json";
  }

  return headers;
}

function parseCookieValue(cookieHeader: string, name: string): string | null {
  const parts = cookieHeader.split(";").map((x) => x.trim());
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq <= 0) continue;
    const k = p.slice(0, eq).trim();
    const v = p.slice(eq + 1);
    if (k === name) return v;
  }
  return null;
}

export function buildAuthHeaders(): AuthHeaders {
  const cookieRaw = optEnv("COOKIE");
  const ppSession = optEnv("PP_SESSION");
  const csrfEnv = optEnv("CSRF");

  if (cookieRaw) {
    const hasSession = cookieRaw.includes("pp_session=");
    const hasCsrf = cookieRaw.includes("__csrf=");
    if (hasSession && hasCsrf) {
      const csrf = parseCookieValue(cookieRaw, "__csrf");
      return { mode: "cookie", csrfToken: csrf, headers: { cookie: cookieRaw } };
    }

    // Allow cookie header missing __csrf if provided separately.
    if (hasSession && !hasCsrf && csrfEnv) {
      const cookie = cookieRaw.endsWith(";") ? `${cookieRaw} __csrf=${csrfEnv}` : `${cookieRaw}; __csrf=${csrfEnv}`;
      return { mode: "cookie", csrfToken: csrfEnv, headers: { cookie } };
    }

    throw new Error("COOKIE must include both pp_session and __csrf (or provide CSRF env var).");
  }

  if (ppSession && csrfEnv) {
    const cookie = `pp_session=${ppSession}; __csrf=${csrfEnv}`;
    return { mode: "session", csrfToken: csrfEnv, headers: { cookie } };
  }

  const internal = optEnv("INTERNAL_SERVICE_SECRET");
  const smokeUserId = optEnv("SMOKE_USER_ID");
  if (internal && smokeUserId) {
    return {
      mode: "internal",
      csrfToken: null,
      headers: {
        "x-internal-service-token": internal,
        "x-user-id": smokeUserId,
      },
    };
  }

  const xuid = optEnv("X_USER_ID");
  if (xuid) {
    return { mode: "x-user-id", csrfToken: null, headers: { "x-user-id": xuid } };
  }

  return { mode: "none", csrfToken: null, headers: {} };
}

function getSetCookies(headers: Headers): string[] {
  const anyHeaders = headers as any;
  if (typeof anyHeaders.getSetCookie === "function") {
    try {
      const v = anyHeaders.getSetCookie();
      return Array.isArray(v) ? v : [];
    } catch {
      // ignore
    }
  }

  const raw = headers.get("set-cookie");
  return raw ? [raw] : [];
}

function mergeSetCookieIntoJar(jar: CookieJar, setCookie: string): void {
  const first = setCookie.split(";")[0] ?? "";
  const eq = first.indexOf("=");
  if (eq <= 0) return;
  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim();
  if (!name) return;
  jar.set(name, value);
}

function jarToCookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function bootstrapDevSessionCookies(): Promise<AuthHeaders> {
  const jar: CookieJar = new Map();

  // 1) Create a dev session cookie (dev-only endpoint).
  // Use redirect: manual so we can read Set-Cookie from the 302.
  const loginRes = await fetch(`${baseUrl()}/api/dev/login`, {
    method: "GET",
    redirect: "manual",
  });
  for (const sc of getSetCookies(loginRes.headers)) {
    mergeSetCookieIntoJar(jar, sc);
  }

  // 2) Ensure CSRF cookie exists (proxy middleware attaches it on responses).
  const healthRes = await fetch(`${baseUrl()}/api/health`, {
    method: "GET",
    headers: jar.size ? { cookie: jarToCookieHeader(jar) } : undefined,
  });
  for (const sc of getSetCookies(healthRes.headers)) {
    mergeSetCookieIntoJar(jar, sc);
  }

  const cookieHeader = jarToCookieHeader(jar);
  const csrf = jar.get("__csrf") ?? null;

  if (!cookieHeader || !cookieHeader.includes("pp_session=") || !csrf) {
    throw new Error(
      "Dev session bootstrap failed (missing pp_session or __csrf). " +
        "Tip: ensure NODE_ENV!=production and that proxy/middleware is running."
    );
  }

  return {
    mode: "cookie",
    csrfToken: csrf,
    headers: { cookie: cookieHeader },
  };
}

export async function resolveAuthHeaders(): Promise<AuthHeaders> {
  const auth = buildAuthHeaders();
  if (auth.mode !== "none") return auth;

  // In dev, allow auto-bootstrapping a session to avoid manual cookie copying.
  if ((process.env.NODE_ENV ?? "").trim() !== "production") {
    try {
      return await bootstrapDevSessionCookies();
    } catch (e) {
      // Fall back to none with a clearer message at call sites.
      return auth;
    }
  }

  return auth;
}

export async function fetchJson(path: string, init?: RequestInit): Promise<{ status: number; json: Json; text: string }>{
  const url = `${baseUrl()}${path}`;
  const res = await fetch(url, init);
  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, json, text };
}

function wantStartDevServer(): boolean {
  const explicit = (process.env.START_DEV_SERVER ?? "").trim().toLowerCase();
  if (explicit === "1" || explicit === "true") return true;

  const auto = (process.env.SMOKE_AUTO_START_SERVER ?? "").trim().toLowerCase();
  if (auto === "0" || auto === "false") return false;

  // Default: in dev-style environments, auto-start the local server so smoke scripts
  // don't fail with misleading "auth=none" when nothing is running.
  if ((process.env.NODE_ENV ?? "").trim() === "production") return false;

  try {
    const u = new URL(baseUrl());
    const host = (u.hostname ?? "").toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
    return isLocal;
  } catch {
    return false;
  }
}

function wantStopDevServerAfterRun(): boolean {
  // If the caller explicitly asked to start the dev server, also stop it.
  const explicit = (process.env.START_DEV_SERVER ?? "").trim().toLowerCase();
  if (explicit === "1" || explicit === "true") return true;

  const stop = (process.env.SMOKE_STOP_SERVER ?? "").trim().toLowerCase();
  if (stop === "1" || stop === "true") return true;
  if (stop === "0" || stop === "false") return false;

  // Default: on Windows shells, stopping the dev server can propagate a console
  // interrupt (exit=130). Keep it running unless explicitly requested.
  return process.platform !== "win32";
}

async function isReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET" });
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

async function waitForReady(opts: { timeoutMs: number }): Promise<void> {
  const deadline = Date.now() + Math.max(1_000, opts.timeoutMs);
  const url = `${baseUrl()}/api/health`;

  while (Date.now() < deadline) {
    if (await isReachable(url)) return;
    await new Promise((r) => setTimeout(r, 350));
  }

  throw new Error(`Dev server did not become ready: ${url}`);
}

function startDevServer(): ChildProc {
  const { spawn } = require("node:child_process") as typeof import("node:child_process");

  // Default to the repo's custom server for reliable /api/* behavior.
  const isWin = process.platform === "win32";
  const cmdDefault = "npm";
  const cmd = (process.env.SMOKE_DEV_COMMAND ?? cmdDefault).trim();
  const argsRaw = (process.env.SMOKE_DEV_ARGS ?? "run -s dev:server").trim();
  const args = argsRaw ? argsRaw.split(/\s+/).filter(Boolean) : [];

  const child = spawn(cmd, args, {
    stdio: isWin ? "ignore" : "inherit",
    // On Windows, npm is typically a .cmd shim and requires a shell.
    shell: isWin,
    detached: true,
    windowsHide: true,
    env: process.env,
  });

  try {
    child.unref();
  } catch {
    // ignore
  }

  return child;
}

function killProcessTree(child: ChildProc): void {
  if (!child?.pid) return;

  if (process.platform === "win32") {
    try {
      const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } catch {
      // ignore
    }
    return;
  }

  // POSIX: if detached, pid is a process group leader; kill the group.
  try {
    process.kill(-child.pid, "SIGTERM");
    return;
  } catch {
    // fall back
  }

  try {
    child.kill("SIGTERM");
  } catch {
    // ignore
  }
}

async function waitForChildExit(child: ChildProc, opts: { timeoutMs: number }): Promise<void> {
  if (!child) return;
  if (child.exitCode !== null) return;

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, Math.max(250, opts.timeoutMs));
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.once("error", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

export async function withOptionalDevServer<T>(fn: () => Promise<T>): Promise<T> {
  if (!wantStartDevServer()) return fn();

  // If already running, don't start a second copy.
  if (await isReachable(`${baseUrl()}/api/health`)) {
    return fn();
  }

  const child = startDevServer();
  try {
    await waitForReady({ timeoutMs: 60_000 });
    return await fn();
  } finally {
    if (wantStopDevServerAfterRun()) {
      killProcessTree(child);

      // Give Windows/Next a moment to release .next/dev locks before the next run.
      try {
        await waitForChildExit(child, { timeoutMs: 6_000 });
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 350));
    }
  }
}

export function assertOk(condition: any, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function summarizeAuth(auth: AuthHeaders): string {
  return auth.mode;
}
