import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProviderChain } from "../supabase/functions/parseBrochurePrizesV2/providerChain";
import { DEFAULT_OPENAI_MODEL, extractOpenAIResponseText, normalizeOpenAIModel, openaiHttpErrorCode } from "../supabase/functions/parseBrochurePrizesV2/openaiProvider";

describe("Parser V2 provider chain helpers", () => {
  it("defaults to Gemini-only behavior", () => {
    expect(parseProviderChain(undefined)).toEqual(["gemini"]);
    expect(parseProviderChain("")).toEqual(["gemini"]);
  });

  it("normalizes, dedupes, and safely ignores unknown providers", () => {
    expect(parseProviderChain(" Gemini, unknown, OPENAI, gemini, anthropic ")).toEqual(["gemini", "openai"]);
  });

  it("returns no providers when only unknown providers are configured", () => {
    expect(parseProviderChain("unknown,anthropic")).toEqual([]);
  });
});

describe("Parser V2 OpenAI provider helpers", () => {
  it("uses a configurable conservative default model", () => {
    expect(normalizeOpenAIModel(undefined)).toBe(DEFAULT_OPENAI_MODEL);
    expect(normalizeOpenAIModel(" gpt-4.1-mini ")).toBe("gpt-4.1-mini");
    expect(normalizeOpenAIModel("bad model!")).toBe(DEFAULT_OPENAI_MODEL);
  });

  it("maps OpenAI HTTP statuses to safe parser error codes", () => {
    expect(openaiHttpErrorCode(401)).toBe("provider_auth_failed");
    expect(openaiHttpErrorCode(403)).toBe("provider_forbidden");
    expect(openaiHttpErrorCode(404)).toBe("provider_model_not_found");
    expect(openaiHttpErrorCode(429)).toBe("provider_rate_limited");
    expect(openaiHttpErrorCode(503)).toBe("provider_unavailable");
  });

  it("extracts Responses API output text from supported response shapes", () => {
    expect(extractOpenAIResponseText({ output_text: "{\"ok\":true}" })).toBe('{"ok":true}');
    expect(extractOpenAIResponseText({ output: [{ content: [{ type: "output_text", text: "{}" }] }] })).toBe("{}");
  });
});

describe("Parser V2 implementation safety", () => {
  const source = readFileSync("supabase/functions/parseBrochurePrizesV2/index.ts", "utf8");

  it("contains sequential Gemini-to-OpenAI fallback for provider_fetch availability failures", () => {
    expect(source).toContain("parseProviderChain");
    expect(source).toContain("extractWithGeminiPdf(pdfBytes, storagePath) : await extractWithOpenAIPdf");
    expect(source).toContain('"provider_rate_limited", "provider_unavailable", "provider_http_error", "provider_model_not_found"');
    expect(source).toContain("continue;");
  });

  it("sends OpenAI PDF data as base64 input_file and never as a URL", () => {
    expect(source).toContain('type: "input_file"');
    expect(source).toContain("data:application/pdf;base64");
    expect(source).not.toContain("signedUrl");
    expect(source).not.toContain("createSignedUrl");
  });

  it("does not introduce category/prize write paths in Parser V2", () => {
    expect(source).not.toMatch(/\.from\(["'](?:categories|prizes|tournaments)["']\)\s*\.\s*(?:insert|update|delete|upsert)\s*\(/);
    expect(source).not.toMatch(/\.storage\.from\([^)]*\)\s*\.\s*(?:upload|remove)\s*\(/);
  });

  it("does not hardcode secrets or raw provider payload logging", () => {
    expect(source).not.toContain("console.log(body");
    expect(source).not.toContain("console.log(prompt");
    expect(source).not.toContain("console.log(pdfBytes");
    expect(source).not.toContain("console.log(apiKey");
    expect(source).not.toContain("OPENAI_API_KEY=");
  });
});
