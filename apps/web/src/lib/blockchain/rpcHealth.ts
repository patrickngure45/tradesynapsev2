import { ethers } from "ethers";

export type SupportedChain = "bsc" | "eth";

type RpcStats = {
  url: string;
  lastOkAtMs: number | null;
  lastFailAtMs: number | null;
  lastLatencyMs: number | null;
  okStreak: number;
  failStreak: number;
};

const STATS_BY_URL = new Map<string, RpcStats>();

function nowMs(): number {
  return Date.now();
}

function normUrl(url: string): string {
  return String(url || "").trim();
}

function parseRpcUrls(raw: string): string[] {
  return raw
    .split(/[\s,\n]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((u) => u.startsWith("http://") || u.startsWith("https://"));
}

function uniqUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const url = normUrl(u);
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

export function getRpcUrls(chain: SupportedChain): string[] {
  if (chain === "bsc") {
    const primary = normUrl(process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org");
    const extraRaw = normUrl(process.env.BSC_RPC_URLS ?? process.env.BSC_RPC_FALLBACK_URLS ?? "");
    const extras = extraRaw ? parseRpcUrls(extraRaw) : [];
    return uniqUrls([primary, ...extras]);
  }

  const primary = normUrl(
    process.env.ETH_RPC_URL || process.env.ETHEREUM_RPC_URL || "https://cloudflare-eth.com",
  );
  const extraRaw = normUrl(process.env.ETH_RPC_URLS ?? process.env.ETH_RPC_FALLBACK_URLS ?? "");
  const extras = extraRaw ? parseRpcUrls(extraRaw) : [];
  return uniqUrls([primary, ...extras]);
}

function getOrInitStats(url: string): RpcStats {
  const u = normUrl(url);
  const key = u.toLowerCase();
  const existing = STATS_BY_URL.get(key);
  if (existing) return existing;
  const fresh: RpcStats = {
    url: u,
    lastOkAtMs: null,
    lastFailAtMs: null,
    lastLatencyMs: null,
    okStreak: 0,
    failStreak: 0,
  };
  STATS_BY_URL.set(key, fresh);
  return fresh;
}

export function markRpcOk(url: string, latencyMs?: number | null): void {
  const s = getOrInitStats(url);
  s.lastOkAtMs = nowMs();
  s.okStreak = Math.min(50, s.okStreak + 1);
  s.failStreak = 0;
  if (typeof latencyMs === "number" && Number.isFinite(latencyMs) && latencyMs >= 0) {
    s.lastLatencyMs = Math.max(0, Math.min(120_000, Math.trunc(latencyMs)));
  }
}

export function markRpcFail(url: string): void {
  const s = getOrInitStats(url);
  s.lastFailAtMs = nowMs();
  s.failStreak = Math.min(50, s.failStreak + 1);
  s.okStreak = 0;
}

function score(url: string): number {
  const s = getOrInitStats(url);
  let v = 0;

  // Prefer URLs that succeeded recently.
  if (s.lastOkAtMs != null) {
    const ageOk = nowMs() - s.lastOkAtMs;
    if (ageOk < 60_000) v += 250;
    else if (ageOk < 10 * 60_000) v += 120;
    else if (ageOk < 60 * 60_000) v += 40;
  }

  // Penalize recent failures (hard).
  if (s.lastFailAtMs != null) {
    const ageFail = nowMs() - s.lastFailAtMs;
    if (ageFail < 60_000) v -= 500;
    else if (ageFail < 10 * 60_000) v -= 250;
    else if (ageFail < 60 * 60_000) v -= 80;
  }

  v -= s.failStreak * 120;
  v += s.okStreak * 10;

  // Prefer lower latency when known.
  if (s.lastLatencyMs != null) {
    v -= Math.min(10_000, Math.max(0, s.lastLatencyMs)) / 20;
  }

  return v;
}

export function rankRpcUrls(chain: SupportedChain): string[] {
  const urls = getRpcUrls(chain);
  if (urls.length <= 1) return urls;

  const ranked = urls.map((url, idx) => ({ url, idx, s: score(url) }));
  ranked.sort((a, b) => {
    if (a.s !== b.s) return b.s - a.s;
    return a.idx - b.idx;
  });
  return ranked.map((r) => r.url);
}

function timeoutPromise<T>(ms: number, label: string): Promise<T> {
  return new Promise((_, reject) => {
    const t = setTimeout(() => {
      clearTimeout(t);
      reject(new Error(`${label}_timeout`));
    }, ms);
  });
}

export async function probeRpcUrl(chain: SupportedChain, url: string, timeoutMs: number): Promise<void> {
  const chainId = chain === "bsc" ? (Number(process.env.NEXT_PUBLIC_USE_MAINNET) === 0 ? 97 : 56) : Number(process.env.NEXT_PUBLIC_USE_MAINNET) === 0 ? 11155111 : 1;
  const network = ethers.Network.from({ name: chain === "bsc" ? "bnb" : "ethereum", chainId });
  const provider = new ethers.JsonRpcProvider(url, network, { staticNetwork: network });

  const t0 = nowMs();
  await Promise.race([provider.getBlockNumber(), timeoutPromise(timeoutMs, "rpc_probe")]);
  markRpcOk(url, nowMs() - t0);
}

export function isLikelyRpcTransportError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.toLowerCase();
  return (
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("econnreset") ||
    m.includes("socket hang up") ||
    m.includes("failed to fetch") ||
    m.includes("network error") ||
    m.includes("503") ||
    m.includes("502") ||
    m.includes("504") ||
    m.includes("429") ||
    m.includes("rate limit") ||
    m.includes("gateway")
  );
}
