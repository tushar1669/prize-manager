import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseProviderErrorDiagnostics,
  providerErrorBodyMaxBytes,
  readProviderErrorBodyCapped,
} from "../supabase/functions/parseBrochurePrizesV2/geminiProvider";
import { userFacingErrorMessage } from "@/utils/parserV2Response";

const source = readFileSync("supabase/functions/parseBrochurePrizesV2/index.ts", "utf8");
const provider = readFileSync("supabase/functions/parseBrochurePrizesV2/geminiProvider.ts", "utf8");
const schema = readFileSync("supabase/functions/parseBrochurePrizesV2/parserResultResponseSchema.ts", "utf8");

describe("Parser V2 provider error diagnostics", () => {
  it("keeps HTTP 400 as provider_request_invalid and extracts INVALID_ARGUMENT", () => {
    const diagnostics = parseProviderErrorDiagnostics(JSON.stringify({ error: { code: 400, status: "INVALID_ARGUMENT", message: "bad" } }));
    expect(diagnostics.providerErrorStatus).toBe("INVALID_ARGUMENT");
    expect(provider).toContain('if (status === 400) return "provider_request_invalid"');
    expect(source).toContain('provider_error_status');
  });

  it("extracts only capped and sanitized field violation paths", () => {
    const long = `generationConfig.${"a".repeat(190)}`;
    const fields = Array.from({ length: 12 }, (_, i) => ({
      field: `generationConfig.responseJsonSchema.properties.valid[${i}]`,
      description: `secret description ${i}`,
      rejectedValue: `secret rejected ${i}`,
    }));
    fields.splice(1, 0, { field: "bad path with spaces", description: "secret", rejectedValue: "secret" });
    fields.splice(2, 0, { field: long, description: "secret", rejectedValue: "secret" });
    const diagnostics = parseProviderErrorDiagnostics(JSON.stringify({ error: { status: "INVALID_ARGUMENT", message: "invalid enum", details: [{ fieldViolations: fields }] } }));
    expect(diagnostics.providerErrorFields).toHaveLength(10);
    expect(diagnostics.providerErrorFields).toContain("generationConfig.responseJsonSchema.properties.valid[0]");
    expect(diagnostics.providerErrorFields).not.toContain("bad path with spaces");
    expect(JSON.stringify(diagnostics)).not.toMatch(/secret description|secret rejected/);
  });

  it.each([
    ["schema complexity exceeded", "schema_too_complex"],
    ["unknown field generationConfig.foo", "unsupported_field"],
    ["invalid enum value", "unsupported_value"],
    ["JSON schema validation failed", "schema_invalid"],
    ["request is malformed", "request_invalid"],
  ])("classifies %s", (message, category) => {
    expect(parseProviderErrorDiagnostics(JSON.stringify({ error: { status: "INVALID_ARGUMENT", message } })).providerErrorCategory).toBe(category);
  });

  it("handles non-JSON and absent bodies as unknown", () => {
    expect(parseProviderErrorDiagnostics("not json").providerErrorCategory).toBe("unknown");
    expect(parseProviderErrorDiagnostics(null).providerErrorCategory).toBe("unknown");
  });

  it("caps provider body reads at 16,384 bytes and cancels oversized streams", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(providerErrorBodyMaxBytes() + 100)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const text = await readProviderErrorBodyCapped(new Response(stream), providerErrorBodyMaxBytes());
    expect(text?.length).toBe(providerErrorBodyMaxBytes());
    expect(cancelled).toBe(true);
    expect(providerErrorBodyMaxBytes()).toBe(16_384);
  });

  it("keeps 400 non-retryable with one attempted model and preserves 429/503 handling", () => {
    expect(source).toContain('err.code === "provider_rate_limited"');
    expect(source).toContain('err.code === "provider_unavailable"');
    expect(source).toContain('err.code === "provider_timeout"');
    expect(source).not.toMatch(/err\.code === "provider_request_invalid"[\s\S]*continue/);
    expect(source).toContain("attempted_model_count");
    expect(source).toContain("attempted_models");
    expect(provider).toContain('if (status === 429) return "provider_rate_limited"');
    expect(provider).toContain('if (status >= 500 && status <= 599) return "provider_unavailable"');
  });

  it("preserves Gemini success request shape and schema file", () => {
    expect(source).toContain('responseMimeType: "application/json"');
    expect(source).toContain("responseJsonSchema: PARSER_RESULT_RESPONSE_JSON_SCHEMA");
    expect(schema).toContain("PARSER_RESULT_RESPONSE_JSON_SCHEMA");
  });

  it("does not expose raw provider body/message in responses or logs", () => {
    const parserErrorBodyBlock = source.slice(source.indexOf("function parserErrorBody"), source.indexOf("function safeLog"));
    const nonOkBlock = source.slice(source.indexOf("if (!res.ok)"), source.indexOf("let data:"));
    expect(parserErrorBodyBlock).not.toMatch(/bodyText|description|rejectedValue|provider_body|providerErrorMessage/);
    expect(nonOkBlock).not.toMatch(/provider_body|description|rejectedValue|console\.log/);
  });

  it("adds safe frontend copy only for provider_request_invalid", () => {
    expect(userFacingErrorMessage("provider_request_invalid")).toBe("The AI parser request was rejected by the provider. No changes were made. Please contact support with the reference shown below.");
  });

  it("keeps Parser V2 no-write and no second provider references", () => {
    expect(source).not.toMatch(/\.(insert|update|delete|upsert|upload|remove)\s*\(/);
    expect(`${source}\n${provider}`).not.toMatch(new RegExp(["OPE" + "NAI", "ope" + "nai"].join("|")));
  });
});
