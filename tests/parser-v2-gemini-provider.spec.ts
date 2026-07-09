import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_GEMINI_MODEL,
  geminiGenerateContentUrl,
  geminiHttpErrorCode,
  normalizeGeminiModel,
  parseFallbackModels,
  parseRetryAfterSeconds,
} from "../supabase/functions/parseBrochurePrizesV2/geminiProvider";

describe("Parser V2 Gemini provider helpers", () => {
  it("normalizes Gemini model ids for the Google Gemini API endpoint", () => {
    expect(normalizeGeminiModel("gemini-x")).toBe("gemini-x");
    expect(normalizeGeminiModel("models/gemini-x")).toBe("gemini-x");
    expect(normalizeGeminiModel("models/models/gemini-x")).toBe("gemini-x");
    expect(normalizeGeminiModel("  models/gemini-x  ")).toBe("gemini-x");
    expect(normalizeGeminiModel(undefined)).toBe(DEFAULT_GEMINI_MODEL);
  });

  it("builds a single models/{model}:generateContent endpoint", () => {
    const url = geminiGenerateContentUrl(normalizeGeminiModel("models/gemini-x"), "test-key");
    expect(url).toContain("/v1beta/models/gemini-x:generateContent");
    expect(url).not.toContain("models/models");
    expect(url).not.toContain("models%2Fgemini-x");
  });

  it("maps Gemini HTTP statuses to safe error codes", () => {
    expect(geminiHttpErrorCode(404)).toBe("provider_model_not_found");
    expect(geminiHttpErrorCode(429)).toBe("provider_rate_limited");
    expect(geminiHttpErrorCode(500)).toBe("provider_unavailable");
    expect(geminiHttpErrorCode(401)).toBe("provider_auth_failed");
  });
});

describe("parseFallbackModels", () => {
  it("returns [] for empty/missing input", () => {
    expect(parseFallbackModels(undefined)).toEqual([]);
    expect(parseFallbackModels(null)).toEqual([]);
    expect(parseFallbackModels("")).toEqual([]);
    expect(parseFallbackModels("   ,,  ")).toEqual([]);
  });

  it("trims, normalizes, and dedupes entries", () => {
    expect(
      parseFallbackModels("  models/gemini-2.0-flash-lite , gemini-2.5-flash-lite ,gemini-2.0-flash-lite"),
    ).toEqual(["gemini-2.0-flash-lite", "gemini-2.5-flash-lite"]);
  });

  it("excludes the primary model from the fallback list", () => {
    expect(
      parseFallbackModels("gemini-2.0-flash,gemini-2.0-flash-lite", "gemini-2.0-flash"),
    ).toEqual(["gemini-2.0-flash-lite"]);
  });
});

describe("parseRetryAfterSeconds", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-07-09T00:00:00Z")));
  afterEach(() => vi.useRealTimers());

  it("returns null for missing/invalid values", () => {
    expect(parseRetryAfterSeconds(null)).toBeNull();
    expect(parseRetryAfterSeconds("")).toBeNull();
    expect(parseRetryAfterSeconds("not-a-date")).toBeNull();
  });

  it("parses delta-seconds", () => {
    expect(parseRetryAfterSeconds("42")).toBe(42);
    expect(parseRetryAfterSeconds(" 0 ")).toBe(0);
  });

  it("parses HTTP-date to non-negative seconds", () => {
    expect(parseRetryAfterSeconds("Thu, 09 Jul 2026 00:00:30 GMT")).toBe(30);
    expect(parseRetryAfterSeconds("Wed, 08 Jul 2026 00:00:00 GMT")).toBe(0);
  });
});
