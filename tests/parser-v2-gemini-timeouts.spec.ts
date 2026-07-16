import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { userFacingErrorMessage } from "@/utils/parserV2Response";

const source = readFileSync("supabase/functions/parseBrochurePrizesV2/index.ts", "utf8");
const frontend = readFileSync("src/utils/parserV2Response.ts", "utf8");

describe("Parser V2 Gemini transport timeout safety", () => {
  it("classifies AbortError as provider_timeout without treating all fetch failures as timeouts", () => {
    expect(source).toContain("function isAbortError(err: unknown): boolean");
    expect(source).toContain('(err instanceof Error || err instanceof DOMException) && err.name === "AbortError"');
    expect(source).toContain('const code = isAbortError(err) ? "provider_timeout" : "provider_request_failed"');
    expect(source).not.toMatch(/TypeError.*provider_timeout|provider_timeout.*TypeError/s);
  });

  it("keeps generic network exceptions on provider_request_failed without raw exception exposure", () => {
    expect(source).toContain('provider_request_failed');
    expect(source).not.toMatch(/message:\s*err|console\.log\([^)]*err/);
  });

  it("preserves existing Gemini 503 and 429 classifications", () => {
    const provider = readFileSync("supabase/functions/parseBrochurePrizesV2/geminiProvider.ts", "utf8");
    expect(provider).toContain('if (status === 429) return "provider_rate_limited"');
    expect(provider).toContain('if (status >= 500 && status <= 599) return "provider_unavailable"');
    expect(source).toContain('providerStatus: res.status');
  });

  it("returns safe timeout metadata on backend errors", () => {
    expect(source).toContain('timeout_scope');
    expect(source).toContain('timeout_ms');
    expect(source).toContain('attempted_model_count');
    expect(source).toContain('attempted_models');
    expect(source).toContain('job_id: jobId');
    expect(source).toContain('request_id: jobId');
    expect(source).toContain('provider: error.provider ?? "gemini"');
    expect(source).toContain('model_id: error.modelId');
  });

  it("excludes raw errors, secrets, prompts, PDF bytes, and provider bodies from timeout responses and logs", () => {
    const parserErrorBodyBlock = source.slice(source.indexOf("function parserErrorBody"), source.indexOf("function safeLog"));
    const safeLogBlock = source.slice(source.indexOf("function safeLog"), source.indexOf("function isAbortError"));
    expect(`${parserErrorBodyBlock}\n${safeLogBlock}`).not.toMatch(/apiKey|prompt|pdfBytes|base64|Authorization|signedUrl|raw|stack|err\.message/i);
    expect(source).not.toContain('createSignedUrl');
  });

  it("bounds the complete Gemini model chain and repair attempts", () => {
    expect(source).toContain('const GEMINI_PROVIDER_REQUEST_TIMEOUT_MS = 45_000');
    expect(source).toContain('const GEMINI_TOTAL_EXTRACTION_TIMEOUT_MS = 50_000');
    expect(source).toContain('const GEMINI_MIN_REMAINING_MS_TO_START_CALL = 1_000');
    expect(source).toContain('const extractionDeadlineMs = extractionStartedMs + GEMINI_TOTAL_EXTRACTION_TIMEOUT_MS');
    expect(source).toContain('Math.min(GEMINI_PROVIDER_REQUEST_TIMEOUT_MS, remainingMs(deadlineMs))');
    expect(source).toContain('ensureGeminiBudget(extractionDeadlineMs, model);');
    expect(source).toContain('timeoutScope: "total_extraction"');
  });

  it("retries provider_timeout only for a remaining model and remaining total budget", () => {
    expect(source).toContain('err.code === "provider_rate_limited" || err.code === "provider_unavailable" || err.code === "provider_timeout"');
    expect(source).toContain('chain[index + 1] && remainingMs(extractionDeadlineMs) >= GEMINI_MIN_REMAINING_MS_TO_START_CALL');
    expect(source).toContain('for (const [index, model] of chain.entries())');
    expect(source).toContain('attempted.push(model)');
  });

  it("has no unbounded retry loop or second provider references", () => {
    expect(source).not.toMatch(/while\s*\(|for\s*\(\s*;\s*;/);
    expect(source).not.toMatch(new RegExp(["OPE" + "NAI", "ope" + "nai", "PROVIDER_CHAIN"].join("|")));
  });

  it("does not introduce Parser V2 write paths", () => {
    expect(source).not.toMatch(/\.(insert|update|delete|upsert|upload|remove)\s*\(/);
  });

  it("maps provider_timeout to the exact safe frontend copy", () => {
    const copy = "The AI parser timed out while reading the brochure. Try again later or use the existing parser or manual setup.";
    expect(frontend).toContain(`provider_timeout:\n    "${copy}"`);
    expect(userFacingErrorMessage("provider_timeout")).toBe(copy);
  });
});
