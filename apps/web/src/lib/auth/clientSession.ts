import { fetchJsonOrThrow } from "@/lib/api/client";

export type WhoAmIResponse = {
  user_id: string | null;
  user: unknown | null;
};

export async function fetchWhoAmI(): Promise<WhoAmIResponse> {
  return await fetchJsonOrThrow<WhoAmIResponse>("/api/whoami", {
    cache: "no-store",
  });
}

export async function createSessionCookie(opts: {
  userId: string;
  ttlSeconds?: number;
  bootstrapKey?: string;
}): Promise<{ ok: true; user_id: string; ttl_seconds: number }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.bootstrapKey) headers["x-session-bootstrap-key"] = opts.bootstrapKey;

  return await fetchJsonOrThrow("/api/auth/session", {
    method: "POST",
    headers,
    body: JSON.stringify({
      user_id: opts.userId,
      ttl_seconds: opts.ttlSeconds,
    }),
  });
}

export async function clearSessionCookie(): Promise<{ ok: true }> {
  return await fetchJsonOrThrow("/api/auth/session", {
    method: "DELETE",
  });
}
