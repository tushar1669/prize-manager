const GENDER_DETECTION_TOOLTIP =
  "Prize-Manager reads gender from explicit gender columns, the FS column, headerless F markers between Name and Rating, and girl-specific groups like FMG/F13.";

/**
 * Checks if any categories in the list are female-only.
 * Looks for:
 * - criteria_json.gender === 'F' or 'f' or 'female' or 'girl'
 * - Category names containing 'girl', 'female', 'women', 'fmg'
 */
function checkHasFemaleCategories(
  categories: Array<{
    name: string;
    criteria_json?: {
      gender?: string;
      allowed_types?: string[];
      allowed_groups?: string[];
    } | null;
  }> | null | undefined,
): boolean {
  if (!categories || categories.length === 0) return false;

  const femaleGenderValues = new Set(["f", "female", "girl", "girls", "woman", "women"]);
  const femaleNamePatterns = /\b(girl|female|women|fmg|ladies)\b/i;
  const femaleTypePatterns = /^(fmg|f\d{1,2})$/i;

  for (const cat of categories) {
    // Check criteria_json.gender
    const gender = cat.criteria_json?.gender?.toLowerCase()?.trim();
    if (gender && femaleGenderValues.has(gender)) {
      return true;
    }

    // Check category name
    if (femaleNamePatterns.test(cat.name)) {
      return true;
    }

    // Check allowed_types for FMG, F9, F13, etc.
    const types = cat.criteria_json?.allowed_types ?? [];
    for (const t of types) {
      if (femaleTypePatterns.test(t)) {
        return true;
      }
    }

    // Check allowed_groups for FMG, GIRL, etc.
    const groups = cat.criteria_json?.allowed_groups ?? [];
    for (const g of groups) {
      if (femaleTypePatterns.test(g) || femaleNamePatterns.test(g)) {
        return true;
      }
    }
  }

  return false;
}

export { GENDER_DETECTION_TOOLTIP, checkHasFemaleCategories };
