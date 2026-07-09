import { describe, expect, it } from "vitest";
import {
  DEFAULT_GEMINI_MODEL,
  geminiGenerateContentUrl,
  geminiHttpErrorCode,
  normalizeGeminiModel,
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

  it("maps Gemini 404 responses to a precise model-not-found error", () => {
    expect(geminiHttpErrorCode(404)).toBe("provider_model_not_found");
  });
});
