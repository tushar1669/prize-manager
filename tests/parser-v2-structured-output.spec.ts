import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PARSER_RESULT_RESPONSE_JSON_SCHEMA } from "../supabase/functions/parseBrochurePrizesV2/parserResultResponseSchema";

const source = readFileSync("supabase/functions/parseBrochurePrizesV2/index.ts", "utf8");
const oldParser = readFileSync("supabase/functions/parseBrochurePrizes/index.ts", "utf8");
const schemaSource = readFileSync("supabase/functions/parseBrochurePrizesV2/parserResultResponseSchema.ts", "utf8");
type SchemaNode = { [key: string]: unknown; properties?: Record<string, SchemaNode>; items?: SchemaNode; required?: string[]; enum?: unknown[]; type?: unknown; additionalProperties?: boolean; maxItems?: number; maximum?: number };
const schema = PARSER_RESULT_RESPONSE_JSON_SCHEMA as SchemaNode;

const stringify = (value: unknown) => JSON.stringify(value);

describe("Parser V2 Gemini structured output", () => {
  it("sends exactly one provider JSON Schema with the documented responseFormat text shape", () => {
    const requestBlock = source.slice(source.indexOf("body = JSON.stringify"), source.indexOf("let res: Response"));
    expect(requestBlock).toContain("responseFormat");
    expect(requestBlock).toContain("text:");
    expect(requestBlock).toContain('mimeType: "application/json"');
    expect(requestBlock).toContain("schema: PARSER_RESULT_RESPONSE_JSON_SCHEMA");
    expect(requestBlock).not.toContain("response_mime_type");
    expect(requestBlock.match(/schema: PARSER_RESULT_RESPONSE_JSON_SCHEMA/g)).toHaveLength(1);
  });

  it("includes required category, prize, gift item, and criteria fields", () => {
    const category = schema.properties.categories.items;
    const prize = category.properties.prizes.items;
    const criteria = category.properties.criteria_suggestions;
    expect(category.required).toEqual(expect.arrayContaining(["name", "is_main", "order_idx", "criteria_suggestions", "confidence", "source_page", "source_text_excerpt", "warnings", "unknowns", "prizes"]));
    expect(prize.required).toEqual(expect.arrayContaining(["place", "prize_name", "cash_amount", "currency", "has_trophy", "has_medal", "gift_items", "confidence", "source_page", "source_text_excerpt", "warnings", "unknowns"]));
    expect(prize.properties.gift_items.items.required).toEqual(["name", "qty"]);
    expect(criteria.required).toEqual(expect.arrayContaining(["category_type", "age_band", "gender", "rating_min", "rating_max", "state", "city", "club", "unrated_only", "requires_manual_confirmation"]));
  });

  it("uses supported nullable type arrays and confidence enums", () => {
    const category = schema.properties.categories.items;
    const prize = category.properties.prizes.items;
    expect(schema.properties.source.properties.page_count.type).toEqual(["integer", "null"]);
    expect(schema.properties.tournament_details.properties.title.type).toEqual(["string", "null"]);
    expect(category.properties.criteria_suggestions.properties.rating_min.type).toEqual(["number", "null"]);
    expect(category.properties.criteria_suggestions.properties.unrated_only.type).toEqual(["boolean", "null"]);
    expect(prize.properties.place.type).toEqual(["integer", "null"]);
    expect(schema.properties.overall_confidence.enum).toEqual(["HIGH", "MEDIUM", "LOW"]);
    expect(category.properties.confidence.enum).toEqual(["HIGH", "MEDIUM", "LOW"]);
    expect(prize.properties.confidence.enum).toEqual(["HIGH", "MEDIUM", "LOW"]);
  });

  it("bounds category, prize, page, warnings, unknowns, and gift item limits", () => {
    const category = schema.properties.categories.items;
    const prize = category.properties.prizes.items;
    expect(schema.properties.categories.maxItems).toBe(80);
    expect(category.properties.prizes.maxItems).toBe(200);
    expect(prize.properties.gift_items.maxItems).toBe(50);
    expect(prize.properties.gift_items.items.properties.qty.maximum).toBe(999);
    expect(category.properties.source_page.maximum).toBe(500);
    expect(prize.properties.source_page.maximum).toBe(500);
    expect(schema.properties.warnings.maxItems).toBe(200);
    expect(schema.properties.unknowns.maxItems).toBe(200);
  });

  it("uses additionalProperties false on nested model-owned objects", () => {
    const category = schema.properties.categories.items;
    const prize = category.properties.prizes.items;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.source.additionalProperties).toBe(false);
    expect(schema.properties.tournament_details.additionalProperties).toBe(false);
    expect(category.additionalProperties).toBe(false);
    expect(category.properties.criteria_suggestions.additionalProperties).toBe(false);
    expect(prize.additionalProperties).toBe(false);
    expect(prize.properties.gift_items.items.additionalProperties).toBe(false);
  });

  it("excludes trusted server-owned fields from provider schema and overwrites them before Zod validation", () => {
    const schemaJson = stringify(schema);
    expect(schemaJson).not.toMatch(/schema_version|requires_review|team_groups|file_path/);
    expect(schema.properties.source.required).toEqual(["page_count", "ocr_used", "ocr_quality"]);
    expect(schema.properties.source.properties).not.toHaveProperty("provider");
    expect(schema.properties.source.properties).not.toHaveProperty("model");
    expect(schema.properties.source.properties).not.toHaveProperty("type");
    expect(source).toContain("raw.schema_version = SCHEMA_VERSION");
    expect(source).toContain("raw.requires_review = true");
    expect(source).toContain("raw.team_groups = []");
    expect(source).toContain('type: "pdf", provider: "gemini", model, file_path: filePath');
    expect(source).toContain("parserResultSchema.safeParse(raw)");
  });

  it("keeps repair schema-bound, one-shot, PDF-free, and inside the total deadline", () => {
    expect(source.match(/callGemini\(pdfBytes, filePath, model, extractionDeadlineMs/g)).toHaveLength(2);
    expect(source).toContain("repairInputForProvider(parsed, first)");
    expect(source).toContain("Invalid output follows (truncated):");
    expect(source).toContain("invalidOutput.slice(0, 12000)");
    expect(source).toContain("ensureGeminiBudget(extractionDeadlineMs, model);");
    expect(source).toContain("const GEMINI_TOTAL_EXTRACTION_TIMEOUT_MS = 50_000");
    const repairBranch = source.slice(source.indexOf("? [{ text:"), source.indexOf(": [{ text: extractionPrompt"));
    expect(repairBranch).toContain("? [{ text:");
    expect(repairBranch).not.toContain("inline_data");
  });

  it("returns only capped safe output diagnostics for invalid JSON and schema mismatches", () => {
    expect(source).toContain('outputFailureKind: "schema_mismatch"');
    expect(source).toContain('outputFailureKind: "invalid_json"');
    expect(source).toContain("schemaIssuePaths: issuePaths");
    expect(source).toContain("schema_issue_count: Math.min(error.schemaIssueCount, 100)");
    expect(source).toContain("schema_issue_paths: error.schemaIssuePaths.slice(0, 10)");
    const errorBody = source.slice(source.indexOf("function parserErrorBody"), source.indexOf("function safeLog"));
    expect(errorBody).toContain("output_failure_kind");
    expect(errorBody).toContain("schema_issue_count");
    expect(errorBody).toContain("schema_issue_paths");
    expect(errorBody).not.toMatch(/text|prompt|pdfBytes|apiKey|stack|message: error|checked\.error\.message/i);
  });

  it("does not introduce writes, OpenAI references, or old parser changes", () => {
    expect(source).not.toMatch(/\.(insert|update|delete|upsert|upload|remove)\s*\(/);
    expect(`${source}\n${schemaSource}`).not.toMatch(new RegExp(["OPE" + "NAI", "ope" + "nai"].join("|")));
    expect(oldParser).not.toContain("PARSER_RESULT_RESPONSE_JSON_SCHEMA");
  });
});
