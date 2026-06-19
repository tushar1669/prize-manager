import type { DraftResult, DraftCategory } from "@/utils/prizeApplyDraft";

/**
 * Frontend safety gate for assistive brochure-parser drafts.
 * Purely heuristic — does NOT change parser behavior, just decides
 * whether the existing "Apply (Add-only)" button is safe to enable.
 */

export type DraftSafetyLevel = "SAFE_HIGH" | "SAFE_MEDIUM" | "UNSAFE";

export interface DraftSafetyResult {
  level: DraftSafetyLevel;
  reasons: string[];
  badCategoryNames: string[];
}

// Non-prize section headings that sometimes get mis-parsed as categories.
const FORBIDDEN_CATEGORY_PATTERNS: RegExp[] = [
  /important\s+instructions?/i,
  /^rules?$/i,
  /system\s+of\s+play/i,
  /number\s+of\s+wins?/i,
  /closing\s+ceremony/i,
  /^schedule$/i,
  /appeals?\s+committee/i,
  /tie[\s-]?break/i,
  /^venue$/i,
  /entry\s+fee/i,
];

const isForbiddenCategoryName = (name: string): boolean => {
  if (!name) return true;
  return FORBIDDEN_CATEGORY_PATTERNS.some((rx) => rx.test(name));
};

const isValidPlace = (place: unknown): boolean =>
  typeof place === "number" && Number.isFinite(place) && place >= 1 && place <= 500;

const prizeHasAnyAward = (p: { cash_amount: number; has_trophy: boolean; has_medal: boolean; gift_items: string[] }): boolean =>
  (typeof p.cash_amount === "number" && p.cash_amount > 0) ||
  !!p.has_trophy ||
  !!p.has_medal ||
  (Array.isArray(p.gift_items) && p.gift_items.length > 0);

const categoryIsValid = (cat: DraftCategory): boolean => {
  if (!cat?.name || isForbiddenCategoryName(cat.name)) return false;
  if (!Array.isArray(cat.prizes) || cat.prizes.length === 0) return false;
  const validPrizes = cat.prizes.filter(
    (p) => isValidPlace(p.place) && prizeHasAnyAward(p),
  );
  // Require at least one valid prize and majority to look real.
  return validPrizes.length >= 1 && validPrizes.length * 2 >= cat.prizes.length;
};

export function validateDraftSafety(
  draft: DraftResult | null | undefined,
): DraftSafetyResult {
  const reasons: string[] = [];
  const badCategoryNames: string[] = [];

  if (!draft) {
    return { level: "UNSAFE", reasons: ["No draft available."], badCategoryNames };
  }

  const cats = Array.isArray(draft.categories) ? draft.categories : [];
  const totalPrizes =
    cats.reduce((s, c) => s + (c.prizes?.length ?? 0), 0) +
    (draft.team_groups?.reduce((s, t) => s + (t.prizes?.length ?? 0), 0) ?? 0);

  if (cats.length === 0) reasons.push("No categories detected.");
  if (totalPrizes === 0) reasons.push("No prize rows detected.");

  for (const c of cats) {
    if (c?.name && isForbiddenCategoryName(c.name)) badCategoryNames.push(c.name);
  }

  const validCats = cats.filter(categoryIsValid);
  if (cats.length > 0 && validCats.length === 0) {
    reasons.push("No category looks like a real prize structure.");
  }
  if (cats.length > 0 && cats.every((c) => (c.confidence ?? "LOW") === "LOW")) {
    reasons.push("Every category is low confidence.");
  }
  if (badCategoryNames.length > 0 && validCats.length === 0) {
    reasons.push("Parsed categories appear to be instructions/rules text, not prizes.");
  }

  if (reasons.length > 0) {
    return { level: "UNSAFE", reasons, badCategoryNames };
  }

  const overall = (draft.overall_confidence ?? "LOW").toUpperCase();
  if (overall === "HIGH") return { level: "SAFE_HIGH", reasons, badCategoryNames };
  // MEDIUM or LOW-but-structurally-valid → require explicit user confirmation
  return { level: "SAFE_MEDIUM", reasons, badCategoryNames };
}
