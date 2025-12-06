import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MissingGenderWarning, checkHasFemaleCategories } from "../MissingGenderWarning";

describe("MissingGenderWarning", () => {
  it("renders nothing when femaleCount > 0", () => {
    const html = renderToString(
      <MissingGenderWarning
        femaleCount={5}
        totalPlayers={100}
        hasFemaleCategories={true}
      />
    );
    expect(html).toBe("");
  });

  it("renders nothing when totalPlayers === 0", () => {
    const html = renderToString(
      <MissingGenderWarning
        femaleCount={0}
        totalPlayers={0}
        hasFemaleCategories={true}
      />
    );
    expect(html).toBe("");
  });

  it("renders error-severity warning when femaleCount=0 and hasFemaleCategories=true", () => {
    const html = renderToString(
      <MissingGenderWarning
        femaleCount={0}
        totalPlayers={100}
        hasFemaleCategories={true}
      />
    );
    
    expect(html).toContain("No female players detected");
    expect(html).toContain("girl/women categories");
    expect(html).toContain("destructive"); // destructive variant class
  });

  it("renders info-severity warning when femaleCount=0 and hasFemaleCategories=false", () => {
    const html = renderToString(
      <MissingGenderWarning
        femaleCount={0}
        totalPlayers={100}
        hasFemaleCategories={false}
      />
    );
    
    expect(html).toContain("No female players detected");
    expect(html).toContain("If this looks wrong");
    expect(html).not.toContain("destructive"); // NOT destructive variant
  });

  it("includes tooltip with gender detection explanation", () => {
    const html = renderToString(
      <MissingGenderWarning
        femaleCount={0}
        totalPlayers={100}
        hasFemaleCategories={true}
      />
    );
    
    // Should have a help icon for the tooltip
    expect(html).toContain("help");
  });
});

describe("checkHasFemaleCategories", () => {
  it("returns false for null/undefined/empty categories", () => {
    expect(checkHasFemaleCategories(null)).toBe(false);
    expect(checkHasFemaleCategories(undefined)).toBe(false);
    expect(checkHasFemaleCategories([])).toBe(false);
  });

  it("returns true when criteria_json.gender is F", () => {
    const categories = [
      { name: "Best Female", criteria_json: { gender: "F" } },
    ];
    expect(checkHasFemaleCategories(categories)).toBe(true);
  });

  it("returns true when criteria_json.gender is female (case insensitive)", () => {
    const categories = [
      { name: "Ladies Prize", criteria_json: { gender: "Female" } },
    ];
    expect(checkHasFemaleCategories(categories)).toBe(true);
  });

  it("returns true when criteria_json.gender is girl", () => {
    const categories = [
      { name: "Under 13", criteria_json: { gender: "girl" } },
    ];
    expect(checkHasFemaleCategories(categories)).toBe(true);
  });

  it("returns true when category name contains girl", () => {
    const categories = [
      { name: "Best Girl Under 15", criteria_json: {} },
    ];
    expect(checkHasFemaleCategories(categories)).toBe(true);
  });

  it("returns true when category name contains female", () => {
    const categories = [
      { name: "BEST FEMALE", criteria_json: null },
    ];
    expect(checkHasFemaleCategories(categories)).toBe(true);
  });

  it("returns true when category name contains women", () => {
    const categories = [
      { name: "Women Champion", criteria_json: {} },
    ];
    expect(checkHasFemaleCategories(categories)).toBe(true);
  });

  it("returns true when category name contains fmg", () => {
    const categories = [
      { name: "FMG Category", criteria_json: {} },
    ];
    expect(checkHasFemaleCategories(categories)).toBe(true);
  });

  it("returns true when allowed_types contains FMG", () => {
    const categories = [
      { name: "Special", criteria_json: { allowed_types: ["FMG"] } },
    ];
    expect(checkHasFemaleCategories(categories)).toBe(true);
  });

  it("returns true when allowed_types contains F13", () => {
    const categories = [
      { name: "Age Group", criteria_json: { allowed_types: ["U13", "F13"] } },
    ];
    expect(checkHasFemaleCategories(categories)).toBe(true);
  });

  it("returns true when allowed_groups contains GIRL", () => {
    const categories = [
      { name: "Group Prize", criteria_json: { allowed_groups: ["GIRL"] } },
    ];
    expect(checkHasFemaleCategories(categories)).toBe(true);
  });

  it("returns false for non-female categories", () => {
    const categories = [
      { name: "Main Prize", criteria_json: { gender: "M" } },
      { name: "Under 15 Boys", criteria_json: { allowed_types: ["U15"] } },
      { name: "Best Local", criteria_json: { allowed_states: ["MP"] } },
    ];
    expect(checkHasFemaleCategories(categories)).toBe(false);
  });

  it("returns false when only gender is M or male", () => {
    const categories = [
      { name: "Boys Prize", criteria_json: { gender: "M" } },
      { name: "Men Champion", criteria_json: { gender: "male" } },
    ];
    expect(checkHasFemaleCategories(categories)).toBe(false);
  });
});
