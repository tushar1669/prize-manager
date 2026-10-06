import { describe, it, expect } from "vitest";
import { buildImportGenderSummary } from "@/utils/importGenderSummary";

describe("buildImportGenderSummary", () => {
  it("counts genders and female sources without names", () => {
    const out = buildImportGenderSummary(
      [
        { gender: "F", gender_source: "headerless_after_name", name: "Alice" } as never,
        { gender: "f", gender_source: "fs_column" },
        { gender: "M" },
        { gender: null },
      ],
      { femaleFromLabels: 1, sources: ["fs_column", "fs_column"] },
    );
    expect(out.female_count).toBe(2);
    expect(out.male_count).toBe(1);
    expect(out.unknown_count).toBe(1);
    expect(out.female_sources).toEqual({ headerless_after_name: 1, fs_column: 1 });
    expect(out.sources_used).toEqual(["fs_column"]);
    expect(JSON.stringify(out)).not.toContain("Alice");
  });
});
