import { describe, it, expect } from "vitest";
import {
  base32Encode,
  base32Decode,
  generateTOTPSecret,
  generateTOTP,
  verifyTOTP,
  buildTOTPUri,
  generateBackupCodes,
} from "@/lib/auth/totp";

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    const buf = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
    const encoded = base32Encode(buf);
    expect(encoded).toBe("JBSWY3DP");
    const decoded = base32Decode(encoded);
    expect(Buffer.compare(buf, decoded)).toBe(0);
  });

  it("round-trips empty buffer", () => {
    const buf = Buffer.alloc(0);
    const encoded = base32Encode(buf);
    expect(encoded).toBe("");
    expect(base32Decode(encoded).length).toBe(0);
  });

  it("round-trips 20-byte secret", () => {
    const buf = Buffer.alloc(20, 0xab);
    const encoded = base32Encode(buf);
    const decoded = base32Decode(encoded);
    expect(Buffer.compare(buf, decoded)).toBe(0);
  });

  it("decodes case-insensitively and strips padding", () => {
    const lower = base32Decode("jbswy3dp");
    const padded = base32Decode("JBSWY3DP====");
    expect(Buffer.compare(lower, padded)).toBe(0);
  });

  it("throws on invalid characters", () => {
    expect(() => base32Decode("JBSWY!!!")).toThrow();
  });
});

describe("generateTOTPSecret", () => {
  it("returns a base32 string of correct length", () => {
    const secret = generateTOTPSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    // 20 bytes → ceil(20*8/5) = 32 chars
    expect(secret.length).toBe(32);
  });

  it("generates unique secrets", () => {
    const a = generateTOTPSecret();
    const b = generateTOTPSecret();
    expect(a).not.toBe(b);
  });
});

describe("generateTOTP + verifyTOTP", () => {
  const secret = "JBSWY3DPEHPK3PXP"; // well-known test vector base32

  it("generates a 6-digit code", () => {
    const code = generateTOTP(secret);
    expect(code).toMatch(/^\d{6}$/);
  });

  it("generates deterministic codes for the same timestamp", () => {
    const now = 1000000000000; // fixed timestamp
    const a = generateTOTP(secret, now);
    const b = generateTOTP(secret, now);
    expect(a).toBe(b);
  });

  it("verifies a code it just generated", () => {
    const now = Date.now();
    const code = generateTOTP(secret, now);
    expect(verifyTOTP(secret, code, now)).toBe(true);
  });

  it("rejects a wrong code", () => {
    const now = Date.now();
    const code = generateTOTP(secret, now);
    // Flip the last digit
    const wrong = code.slice(0, 5) + String((Number(code[5]) + 1) % 10);
    // This _could_ still match within drift window in rare cases,
    // but is overwhelmingly likely to fail
    // We'll test with a fixed time far in the past to avoid drift overlaps
    const fixedTime = 946684800000; // 2000-01-01
    const fixedCode = generateTOTP(secret, fixedTime);
    const badCode = fixedCode.slice(0, 5) + String((Number(fixedCode[5]) + 1) % 10);
    // Verify with a time far from the fixed time so drift can't help
    const farTime = fixedTime + 300_000; // 5 minutes later (well outside ±30s window)
    expect(verifyTOTP(secret, badCode, farTime)).toBe(false);
  });

  it("accepts codes within ±1 step drift", () => {
    const now = 1000000000000;
    // Generate code for 30 seconds ago (1 step back)
    const codePrevStep = generateTOTP(secret, now - 30_000);
    expect(verifyTOTP(secret, codePrevStep, now)).toBe(true);

    // Generate code for 30 seconds ahead (1 step forward)
    const codeNextStep = generateTOTP(secret, now + 30_000);
    expect(verifyTOTP(secret, codeNextStep, now)).toBe(true);
  });

  it("rejects codes outside ±1 step drift", () => {
    const now = 1000000000000;
    // Generate code for 90 seconds ago (3 steps back)
    const codeOld = generateTOTP(secret, now - 90_000);
    expect(verifyTOTP(secret, codeOld, now)).toBe(false);
  });
});

describe("buildTOTPUri", () => {
  it("returns a valid otpauth URI", () => {
    const uri = buildTOTPUri({ secret: "JBSWY3DP", email: "user@test.com" });
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=JBSWY3DP");
    expect(uri).toContain("issuer=TradeSynapse");
    expect(uri).toContain("user%40test.com");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });

  it("accepts a custom issuer", () => {
    const uri = buildTOTPUri({ secret: "ABC", email: "x@y.com", issuer: "MyApp" });
    expect(uri).toContain("issuer=MyApp");
    expect(uri).toContain("MyApp%3Ax%40y.com");
  });
});

describe("generateBackupCodes", () => {
  it("generates 8 codes by default", () => {
    const codes = generateBackupCodes();
    expect(codes.length).toBe(8);
  });

  it("generates custom count", () => {
    const codes = generateBackupCodes(4);
    expect(codes.length).toBe(4);
  });

  it("formats as XXXX-XXXX", () => {
    const codes = generateBackupCodes();
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }
  });

  it("generates unique codes", () => {
    const codes = generateBackupCodes(8);
    const unique = new Set(codes);
    expect(unique.size).toBe(8);
  });
});
