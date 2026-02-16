import { describe, it, expect } from "vitest";
import { isSupportedP2PCountry } from "@/lib/p2p/supportedCountries";

describe("isSupportedP2PCountry", () => {
  it("allows missing country (backwards compatible)", () => {
    expect(isSupportedP2PCountry(null)).toBe(true);
    expect(isSupportedP2PCountry(undefined)).toBe(true);
    expect(isSupportedP2PCountry(" ")).toBe(true);
  });

  it("accepts supported countries with normalization", () => {
    expect(isSupportedP2PCountry("Nigeria")).toBe(true);
    expect(isSupportedP2PCountry("  Nigeria ")).toBe(true);
    expect(isSupportedP2PCountry("South-Africa")).toBe(true);
    expect(isSupportedP2PCountry("United Arab Emirates")).toBe(true);
  });

  it("accepts common aliases", () => {
    expect(isSupportedP2PCountry("UK")).toBe(true);
    expect(isSupportedP2PCountry("UAE")).toBe(true);
    expect(isSupportedP2PCountry("USA")).toBe(true);
    expect(isSupportedP2PCountry("DRC")).toBe(true);
    expect(isSupportedP2PCountry("Democratic Republic of Congo")).toBe(true);
    expect(isSupportedP2PCountry("Republic of Korea")).toBe(true);
  });
});
