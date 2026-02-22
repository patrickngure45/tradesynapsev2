import type { Sql } from "postgres";

import { groq } from "@/lib/ai/client";
import { createPgRateLimiter, type PgRateLimiter } from "@/lib/rateLimitPg";

export type ExplainFields = {
  summary: string;
  blockers: string[];
  next_steps: string[];
};

export type ExplainAiResult =
  | {
      ok: true;
      summary: string;
      blockers: string[];
      next_steps: string[];
    }
  | {
      ok: false;
      error: "disabled" | "no_api_key" | "rate_limit_exceeded" | "ai_failed" | "parse_failed";
      resetMs?: number;
      limit?: number;
    };

let explainAiLimiter: PgRateLimiter | null = null;

export function getExplainAiLimiter(sql: Sql): PgRateLimiter {
  if (explainAiLimiter) return explainAiLimiter;
  explainAiLimiter = createPgRateLimiter(sql, {
    name: "explain-ai-rephrase",
    windowMs: 60_000,
    max: 20,
  });
  return explainAiLimiter;
}

export function isExplainAiRephraseEnabled(): boolean {
  return (process.env.EXPLAIN_ENABLE_AI_REPHRASE ?? "").trim() === "1";
}

export function wantAiFromQueryParam(raw: string | null): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y";
}

export function getClientIpFromHeaders(headers: Headers): string | null {
  const xfwd = headers.get("x-forwarded-for");
  if (xfwd) return xfwd.split(",")[0]?.trim() || null;
  return headers.get("x-real-ip");
}

function clampText(s: string, maxLen: number): string {
  const x = String(s ?? "").replace(/\s+/g, " ").trim();
  if (x.length <= maxLen) return x;
  return x.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
}

function normalizeList(list: unknown, fallback: string[], maxItemLen: number): string[] {
  if (!Array.isArray(list)) return fallback;
  const out = list.map((x) => clampText(String(x ?? ""), maxItemLen));
  if (out.length !== fallback.length) return fallback;
  return out;
}

function safeJsonParse(raw: string): unknown {
  const s = raw.trim();
  if (!s) return null;

  // If the model wraps JSON in a code fence, strip it.
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const body = fence ? fence[1] ?? "" : s;

  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export async function maybeRephraseExplainFields(opts: {
  sql: Sql;
  actingUserId: string;
  wantAi: boolean;
  kind: string;
  fields: ExplainFields;
  headers: Headers;
  context?: Record<string, unknown>;
}): Promise<{ ai: ExplainAiResult } | null> {
  if (!opts.wantAi) return null;

  if (!isExplainAiRephraseEnabled()) {
    return { ai: { ok: false, error: "disabled" } };
  }

  const apiKey = (process.env.GROQ_API_KEY ?? "").trim();
  if (!apiKey) {
    return { ai: { ok: false, error: "no_api_key" } };
  }

  const limiter = getExplainAiLimiter(opts.sql);
  const ip = getClientIpFromHeaders(opts.headers);
  const [rlUser, rlIp] = await Promise.all([
    limiter.consume(`user:${opts.actingUserId}`),
    ip ? limiter.consume(`ip:${ip}`) : Promise.resolve(null),
  ]);
  const rl = !rlUser.allowed ? rlUser : rlIp && !rlIp.allowed ? rlIp : null;
  if (rl && !rl.allowed) {
    return { ai: { ok: false, error: "rate_limit_exceeded", resetMs: rl.resetMs, limit: rl.limit } };
  }

  const input = {
    kind: opts.kind,
    context: opts.context ?? {},
    fields: {
      summary: clampText(opts.fields.summary, 400),
      blockers: opts.fields.blockers.map((x) => clampText(x, 200)),
      next_steps: opts.fields.next_steps.map((x) => clampText(x, 200)),
    },
  };

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You rewrite short operational explanations in plain English. You MUST preserve meaning and MUST NOT add any new facts. Do not provide financial advice. Output ONLY valid JSON with keys: summary (string), blockers (string[]), next_steps (string[]). Keep blockers and next_steps the SAME length as the input arrays and keep their order; only rewrite wording.",
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const parsed = safeJsonParse(content);
    if (!parsed || typeof parsed !== "object") {
      return { ai: { ok: false, error: "parse_failed" } };
    }

    const o: any = parsed;
    const summary = clampText(String(o.summary ?? ""), 240);
    if (!summary) return { ai: { ok: false, error: "parse_failed" } };

    const blockers = normalizeList(o.blockers, opts.fields.blockers, 160);
    const next_steps = normalizeList(o.next_steps, opts.fields.next_steps, 160);

    return {
      ai: {
        ok: true,
        summary,
        blockers,
        next_steps,
      },
    };
  } catch {
    return { ai: { ok: false, error: "ai_failed" } };
  }
}
