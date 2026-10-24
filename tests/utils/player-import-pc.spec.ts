import { describe, it, expect } from "vitest";
import { hasPcToken, normalizeGrColumn } from "@/utils/valueNormalizers";
import { hasFemaleMarker, inferGenderForRow } from "@/utils/genderInference";
import { findGenderOverrides } from "@/components/import/GenderOverrideNotice";

describe("PC marker is a whole word", () => {
  it.each(["PC", "pc", "U12 PC", "PC/U15", "PC-wheelchair", "PC, U15"])("%s counts as PC", (v) => {
    expect(hasPcToken(v)).toBe(true);
    expect(normalizeGrColumn(v).disability).toBe("PC");
  });
  it.each(["NPC", "PCMC", "UPCOMING", "Raipur", "", null])("%s is not PC", (v) => {
    expect(hasPcToken(v)).toBe(false);
    expect(normalizeGrColumn(v).disability).toBeNull();
  });
});

describe("FMG marker is a whole word", () => {
  it("FMG counts, XFMGY does not", () => {
    expect(hasFemaleMarker("FMG")).toBe(true);
    expect(hasFemaleMarker("U13 FMG")).toBe(true);
    expect(hasFemaleMarker("XFMGY")).toBe(false);
  });
});

describe("gender override notice", () => {
  it("lists players whose Gender said M but Type said girl", () => {
    const inf = inferGenderForRow({ gender: "M" }, null, "F13", null);
    expect(inf.gender).toBe("F");
    const players = [
      { rank: 1, name: "A", _genderWarnings: inf.warnings },
      { rank: 2, name: "B", _genderWarnings: [] },
    ];
    expect(findGenderOverrides(players).map((p) => p.rank)).toEqual([1]);
  });
});
