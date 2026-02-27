import { describe, it, expect } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
} from "@/lib/auth/session";

const SECRET = "test-secret-key-at-least-32-chars-long!";

describe("session token", () => {
  it("creates and verifies a valid token", () => {
    const token = createSessionToken({ userId: "user-123", secret: SECRET });
    const result = verifySessionToken({ token, secret: SECRET });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.uid).toBe("user-123");
    }
  });

  it("rejects a tampered token", () => {
    const token = createSessionToken({ userId: "user-123", secret: SECRET });
    const tampered = token.slice(0, -2) + "xx";
    const result = verifySessionToken({ token: tampered, secret: SECRET });
    expect(result.ok).toBe(false);
  });

  it("rejects a token signed with wrong secret", () => {
    const token = createSessionToken({ userId: "user-123", secret: SECRET });
    const result = verifySessionToken({ token, secret: "wrong-secret-key-also-32-chars!!" });
    expect(result.ok).toBe(false);
  });

  it("rejects an expired token", () => {
    const pastMs = Date.now() - 3600 * 1000; // 1 hour ago
    const token = createSessionToken({
      userId: "user-123",
      secret: SECRET,
      ttlSeconds: 60, // 1 minute TTL
      now: pastMs,
    });
    const result = verifySessionToken({ token, secret: SECRET });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("session_token_expired");
    }
  });

  it("accepts a token within TTL", () => {
    const now = Date.now();
    const token = createSessionToken({
      userId: "user-123",
      secret: SECRET,
      ttlSeconds: 3600,
      now,
    });
    const result = verifySessionToken({ token, secret: SECRET, now: now + 1000 });
    expect(result.ok).toBe(true);
  });

  it("rejects empty / malformed tokens", () => {
    expect(verifySessionToken({ token: "", secret: SECRET }).ok).toBe(false);
    expect(verifySessionToken({ token: "noperiod", secret: SECRET }).ok).toBe(false);
    expect(verifySessionToken({ token: "a.", secret: SECRET }).ok).toBe(false);
    expect(verifySessionToken({ token: ".b", secret: SECRET }).ok).toBe(false);
  });

  it("preserves userId through round-trip", () => {
    const ids = ["abc-123", "00000000-0000-0000-0000-000000000000", "x"];
    for (const id of ids) {
      const token = createSessionToken({ userId: id, secret: SECRET });
      const result = verifySessionToken({ token, secret: SECRET });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.payload.uid).toBe(id);
    }
  });
});
