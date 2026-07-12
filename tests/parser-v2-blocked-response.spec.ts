import { describe, expect, it } from "vitest";
import { normalizeParserV2Response } from "@/utils/parserV2Response";

const validDraft = {
  source: "pdf",
  file_path: "brochure.pdf",
  overall_confidence: "HIGH",
  warnings: [],
  categories: [
    {
      name: "Open",
      is_main: true,
      order_idx: 0,
      confidence: "HIGH",
      warnings: [],
      criteria_json: { should_not_persist: true },
      prizes: [
        {
          place: 1,
          cash_amount: 1000,
          has_trophy: false,
          has_medal: false,
          gift_items: [],
          confidence: "HIGH",
          source_text: "1st ₹1000",
        },
      ],
    },
  ],
  team_groups: [],
};

describe("normalizeParserV2Response backend blocked handling", () => {
  it("succeeds for display and forces parserMetadata.blocked for blocked_low_confidence with a valid draft", () => {
    const result = normalizeParserV2Response({
      status: "blocked_low_confidence",
      existing_draft_compat: validDraft,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parserMetadata.blocked).toBe(true);
      expect(result.draft.categories[0].criteria_json).toEqual({});
    }
  });

  it("returns a safe error for blocked_low_confidence without a valid draft", () => {
    const result = normalizeParserV2Response({
      status: "blocked_low_confidence",
      existing_draft_compat: { categories: [] },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("provider_output_invalid");
    }
  });

  it("marks ok_draft with blocked=true as backend blocked", () => {
    const result = normalizeParserV2Response({
      status: "ok_draft",
      blocked: true,
      existing_draft_compat: validDraft,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.parserMetadata.blocked).toBe(true);
  });

  it("keeps normal successful behavior for ok_draft with blocked absent or false", () => {
    const absent = normalizeParserV2Response({
      status: "ok_draft",
      existing_draft_compat: validDraft,
    });
    const falseBlocked = normalizeParserV2Response({
      status: "ok_draft",
      blocked: false,
      existing_draft_compat: validDraft,
    });

    expect(absent.ok).toBe(true);
    expect(falseBlocked.ok).toBe(true);
    if (absent.ok) expect(absent.parserMetadata.blocked).toBe(false);
    if (falseBlocked.ok) expect(falseBlocked.parserMetadata.blocked).toBe(false);
  });
});
