import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Parser V2 Gemini-only safety", () => {
  const source = readFileSync("supabase/functions/parseBrochurePrizesV2/index.ts", "utf8");
  const geminiProvider = readFileSync("supabase/functions/parseBrochurePrizesV2/geminiProvider.ts", "utf8");
  const combined = `${source}\n${geminiProvider}`;

  it("does not retain removed provider names, env vars, endpoints, or provider-chain fallback", () => {
    expect(combined).not.toMatch(new RegExp(["OPE" + "NAI", "ope" + "nai", "Responses" + " API", "BROCHURE_PARSER_V2_" + "PROVIDER_CHAIN", "attempted_" + "provider"].join("|")));
  });

  it("keeps Gemini-only default/configured behavior", () => {
    expect(source).toContain('type ParserProvider = "gemini"');
    expect(source).toContain('Deno.env.get("GEMINI_API_KEY")');
    expect(source).toContain('Deno.env.get("GEMINI_MODEL")');
    expect(source).toContain('Deno.env.get("GEMINI_MODEL_FALLBACKS")');
    expect(source).toContain('provider: "gemini"');
  });

  it("returns safe attempted Gemini model metadata for provider errors", () => {
    expect(source).toContain("attempted_model_count");
    expect(source).toContain("attempted_models");
    expect(source).toContain("provider_status");
    expect(source).toContain("model_id");
    expect(source).toContain("provider_rate_limited");
    expect(source).toContain('geminiHttpErrorCode(res.status)');
  });

  it("maps Gemini 429, 503, and 404 to classified safe errors", () => {
    expect(geminiProvider).toContain('if (status === 404) return "provider_model_not_found"');
    expect(geminiProvider).toContain('if (status === 429) return "provider_rate_limited"');
    expect(geminiProvider).toContain('if (status >= 500 && status <= 599) return "provider_unavailable"');
  });

  it("does not introduce Parser V2 write paths", () => {
    expect(source).not.toMatch(/\.(insert|update|delete|upsert|upload|remove)\s*\(/);
  });

  it("does not log secrets, prompts, raw payloads, PDF bytes, or signed URLs", () => {
    expect(source).not.toMatch(/console\.log\((?:body|prompt|pdfBytes|apiKey)/);
    expect(source).not.toContain("signedUrl");
    expect(source).not.toContain("createSignedUrl");
    expect(source).not.toContain("raw provider");
  });
});
