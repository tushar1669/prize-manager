import * as XLSX from "xlsx";
import { DraftCategory, DraftResult, DraftTeamGroup, DraftPrize } from "@/utils/prizeApplyDraft";

type Severity = "error" | "warning";

export interface PrizeTemplateIssue {
  severity: Severity;
  sheet: string;
  row: number;
  message: string;
}

export interface PrizeTemplateParseResult {
  draft: DraftResult;
  issues: PrizeTemplateIssue[];
}

const SAFE_RULE_FIELDS = [
  "gender",
  "min_age",
  "max_age",
  "min_rating",
  "max_rating",
  "include_unrated",
  "unrated_only",
  "allowed_states",
  "allowed_cities",
  "allowed_clubs",
] as const;

const TEAM_GROUP_BY_VALUES = new Set(["team", "club", "city", "state", "group_label", "type_label"]);

const normalize = (v: unknown) => String(v ?? "").trim();

const parseBoolean = (v: unknown): boolean | null => {
  const raw = normalize(v).toLowerCase();
  if (!raw) return null;
  if (["yes", "y", "true", "1"].includes(raw)) return true;
  if (["no", "n", "false", "0"].includes(raw)) return false;
  return null;
};

const parseNumber = (v: unknown): number | null => {
  const raw = normalize(v);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const parseList = (v: unknown): string[] => {
  const raw = normalize(v);
  if (!raw) return [];
  return raw.split(",").map((x) => x.trim()).filter(Boolean);
};

const parsePlaceRange = (rawValue: unknown): number[] | null => {
  const raw = normalize(rawValue);
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return [Number(raw)];
  const match = raw.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start > end) return null;
  const values: number[] = [];
  for (let i = start; i <= end; i++) values.push(i);
  return values;
};

const buildPrize = (place: number, cashAmount: number, hasTrophy: boolean, hasMedal: boolean, giftItems: string[]): DraftPrize => ({
  place,
  cash_amount: cashAmount,
  has_trophy: hasTrophy,
  has_medal: hasMedal,
  gift_items: giftItems,
  confidence: "HIGH",
  source_text: "xlsx_template",
});

function getSheetRows(workbook: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const ws = workbook.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
}

const CRITERIA_COLUMN_MAPPINGS: Array<[string, string]> = [
  ["Gender", "gender"],
  ["Min Age", "min_age"],
  ["Max Age", "max_age"],
  ["Min Rating", "min_rating"],
  ["Max Rating", "max_rating"],
  ["Include Unrated", "include_unrated"],
  ["Unrated Only", "unrated_only"],
  ["Allowed States", "allowed_states"],
  ["Allowed Cities", "allowed_cities"],
  ["Allowed Clubs", "allowed_clubs"],
];

const normalizeCriteriaForCompare = (criteria: Record<string, unknown>): string =>
  JSON.stringify(Object.entries(criteria).sort(([a], [b]) => a.localeCompare(b)));

function parseCategoryCriteriaFromRow(
  row: Record<string, unknown>,
  sheet: string,
  rowNum: number,
  issues: PrizeTemplateIssue[],
): Record<string, unknown> | null {
  const criteria: Record<string, unknown> = {};

  const allowedGender = normalize(row.Gender).toUpperCase();
  if (allowedGender) {
    if (!["F", "M", "OPEN"].includes(allowedGender)) {
      issues.push({ severity: "error", sheet, row: rowNum, message: "Invalid Gender. Use F/M/OPEN." });
      return null;
    }
    criteria.gender = allowedGender;
  }

  const numFields: Array<[string, string]> = [
    ["Min Age", "min_age"],
    ["Max Age", "max_age"],
    ["Min Rating", "min_rating"],
    ["Max Rating", "max_rating"],
  ];
  for (const [column, field] of numFields) {
    const raw = row[column];
    if (!normalize(raw)) continue;
    const parsed = parseNumber(raw);
    if (parsed === null) {
      issues.push({ severity: "error", sheet, row: rowNum, message: `Invalid ${column}.` });
      return null;
    }
    criteria[field] = parsed;
  }

  const boolFields: Array<[string, string]> = [
    ["Include Unrated", "include_unrated"],
    ["Unrated Only", "unrated_only"],
  ];
  for (const [column, field] of boolFields) {
    const parsed = parseBoolean(row[column]);
    if (normalize(row[column]) && parsed === null) {
      issues.push({ severity: "error", sheet, row: rowNum, message: `Invalid ${column}. Use yes/no.` });
      return null;
    }
    if (parsed !== null) criteria[field] = parsed;
  }

  const listFields: Array<[string, string]> = [
    ["Allowed States", "allowed_states"],
    ["Allowed Cities", "allowed_cities"],
    ["Allowed Clubs", "allowed_clubs"],
  ];
  for (const [column, field] of listFields) {
    const list = parseList(row[column]);
    if (list.length > 0) criteria[field] = list;
  }

  return criteria;
}

export async function parsePrizeTemplateFile(file: File): Promise<PrizeTemplateParseResult> {
  const lower = (file.name || "").toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
    throw new Error("Unsupported file type. Please upload Excel (.xls or .xlsx).");
  }

  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const issues: PrizeTemplateIssue[] = [];

  const categories = new Map<string, DraftCategory>();
  const categoryRows = getSheetRows(workbook, "Categories");

  const parseV1 = categoryRows.length > 0;

  if (parseV1) categoryRows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const name = normalize(row.Name);
    if (!name) {
      issues.push({ severity: "error", sheet: "Categories", row: rowNum, message: "Name is required." });
      return;
    }

    const isMainParsed = parseBoolean(row["Is Main"]);
    if (normalize(row["Is Main"]) && isMainParsed === null) {
      issues.push({ severity: "error", sheet: "Categories", row: rowNum, message: "Invalid Is Main value. Use yes/no." });
      return;
    }

    const criteria = parseCategoryCriteriaFromRow(row, "Categories", rowNum, issues);
    if (!criteria) return;

    categories.set(name.toLowerCase(), {
      name,
      is_main: !!isMainParsed,
      order_idx: categories.size,
      confidence: "HIGH",
      warnings: [],
      criteria_json: criteria,
      prizes: [],
    });
  });

  const mainCount = [...categories.values()].filter((c) => c.is_main).length;
  if (mainCount > 1) {
    issues.push({ severity: "warning", sheet: "Categories", row: 1, message: "Multiple Main categories detected. Apply will reuse one canonical Main category." });
  }

  if (parseV1) {
    const rulesRows = getSheetRows(workbook, "Category Rules");
    rulesRows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const categoryName = normalize(row.Category);
    if (!categoryName) return;

    const category = categories.get(categoryName.toLowerCase());
    if (!category) {
      issues.push({ severity: "error", sheet: "Category Rules", row: rowNum, message: `Unknown category "${categoryName}".` });
      return;
    }

    for (const key of SAFE_RULE_FIELDS) {
      const raw = row[key];
      if (!normalize(raw)) continue;

      if (["include_unrated", "unrated_only"].includes(key)) {
        const parsed = parseBoolean(raw);
        if (parsed === null) {
          issues.push({ severity: "error", sheet: "Category Rules", row: rowNum, message: `Invalid ${key} value.` });
          continue;
        }
        category.criteria_json[key] = parsed;
        continue;
      }

      if (["min_age", "max_age", "min_rating", "max_rating"].includes(key)) {
        const parsed = parseNumber(raw);
        if (parsed === null) {
          issues.push({ severity: "error", sheet: "Category Rules", row: rowNum, message: `Invalid ${key} value.` });
          continue;
        }
        category.criteria_json[key] = parsed;
        continue;
      }

      if (["allowed_states", "allowed_cities", "allowed_clubs"].includes(key)) {
        category.criteria_json[key] = parseList(raw);
        continue;
      }

      if (key === "gender") {
        const g = normalize(raw).toUpperCase();
        if (!["F", "M", "OPEN"].includes(g)) {
          issues.push({ severity: "error", sheet: "Category Rules", row: rowNum, message: "Invalid gender value." });
          continue;
        }
        category.criteria_json[key] = g;
      }
    }
    });
  }

  const seenCategoryPlace = new Set<string>();
  const prizeRows = getSheetRows(workbook, "Prizes");
  prizeRows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const categoryName = normalize(row.Category);
    if (!categoryName) {
      issues.push({ severity: "error", sheet: "Prizes", row: rowNum, message: "Category is required." });
      return;
    }
    const normCategoryName = categoryName.toLowerCase();
    let category = categories.get(normCategoryName);
    if (!category) {
      if (parseV1) {
        issues.push({ severity: "error", sheet: "Prizes", row: rowNum, message: `Unknown category "${categoryName}".` });
        return;
      }

      const isMainParsed = parseBoolean(row["Is Main"]);
      if (normalize(row["Is Main"]) && isMainParsed === null) {
        issues.push({ severity: "error", sheet: "Prizes", row: rowNum, message: "Invalid Is Main value. Use yes/no." });
        return;
      }

      const parsedCriteria = parseCategoryCriteriaFromRow(row, "Prizes", rowNum, issues);
      if (!parsedCriteria) return;

      category = {
        name: categoryName,
        is_main: !!isMainParsed,
        order_idx: categories.size,
        confidence: "HIGH",
        warnings: [],
        criteria_json: parsedCriteria,
        prizes: [],
      };
      categories.set(normCategoryName, category);
    } else if (!parseV1) {
      const isMainParsed = parseBoolean(row["Is Main"]);
      if (normalize(row["Is Main"]) && isMainParsed === null) {
        issues.push({ severity: "error", sheet: "Prizes", row: rowNum, message: "Invalid Is Main value. Use yes/no." });
        return;
      }
      if (isMainParsed !== null && isMainParsed !== category.is_main) {
        issues.push({ severity: "error", sheet: "Prizes", row: rowNum, message: `Conflicting Is Main for category "${categoryName}".` });
        return;
      }

      const parsedCriteria = parseCategoryCriteriaFromRow(row, "Prizes", rowNum, issues);
      if (!parsedCriteria) return;

      const providedMappings = CRITERIA_COLUMN_MAPPINGS.filter(([column]) => normalize(row[column]));
      if (providedMappings.length > 0) {
        const conflictingColumns = providedMappings
          .filter(([, key]) => normalize((category?.criteria_json?.[key] as unknown) ?? "") !== normalize(parsedCriteria[key] ?? ""))
          .map(([column]) => column);

        if (Object.keys(category.criteria_json || {}).length === 0) {
          category.criteria_json = parsedCriteria;
        } else if (conflictingColumns.length > 0) {
          issues.push({
            severity: "error",
            sheet: "Prizes",
            row: rowNum,
            message: `Conflicting criteria for category "${categoryName}" (${conflictingColumns.join(", ")}).`,
          });
          return;
        }
      }
    }

    const places = parsePlaceRange(row.Place);
    if (!places || places.length === 0) {
      issues.push({ severity: "error", sheet: "Prizes", row: rowNum, message: "Invalid Place. Use 1 or range like 6-10." });
      return;
    }

    const cashParsed = parseNumber(row["Cash Amount"]);
    if (normalize(row["Cash Amount"]) && cashParsed === null) {
      issues.push({ severity: "error", sheet: "Prizes", row: rowNum, message: "Invalid Cash Amount." });
      return;
    }

    const trophyParsed = parseBoolean(row.Trophy);
    if (normalize(row.Trophy) && trophyParsed === null) {
      issues.push({ severity: "error", sheet: "Prizes", row: rowNum, message: "Invalid Trophy value. Use yes/no." });
      return;
    }

    const medalParsed = parseBoolean(row.Medal);
    if (normalize(row.Medal) && medalParsed === null) {
      issues.push({ severity: "error", sheet: "Prizes", row: rowNum, message: "Invalid Medal value. Use yes/no." });
      return;
    }

    const giftName = normalize(row.Gift) || normalize(row["Gift Name"]);
    const giftQty = normalize(row["Gift Qty"]) ? parseNumber(row["Gift Qty"]) : null;
    if (normalize(row["Gift Qty"]) && (giftQty === null || giftQty < 0 || !Number.isInteger(giftQty))) {
      issues.push({ severity: "error", sheet: "Prizes", row: rowNum, message: "Invalid Gift Qty. Use a whole number >= 0." });
      return;
    }

    let giftItems: string[] = [];
    if (giftName) {
      if (giftQty !== null) {
        giftItems = Array.from({ length: giftQty }, () => giftName);
      } else {
        giftItems = giftName.split(/[;,]/).map((g) => g.trim()).filter(Boolean);
      }
    }

    for (const place of places) {
      const key = `${category.name.toLowerCase()}:${place}`;
      if (seenCategoryPlace.has(key)) {
        issues.push({ severity: "error", sheet: "Prizes", row: rowNum, message: `Duplicate place ${place} in category "${category.name}".` });
        continue;
      }
      seenCategoryPlace.add(key);

      category.prizes.push(buildPrize(
        place,
        cashParsed ?? 0,
        trophyParsed ?? false,
        medalParsed ?? false,
        giftItems,
      ));
    }
  });

  const teamGroups = new Map<string, DraftTeamGroup>();
  if (parseV1) {
    const teamGroupRows = getSheetRows(workbook, "Team Groups");
    teamGroupRows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const name = normalize(row.Name);
    if (!name) return;

    const groupBy = normalize(row["Group By"]).toLowerCase();
    if (!TEAM_GROUP_BY_VALUES.has(groupBy)) {
      issues.push({ severity: "error", sheet: "Team Groups", row: rowNum, message: "Invalid Group By." });
      return;
    }

    const teamSize = parseNumber(row["Team Size"]);
    const femaleSlots = parseNumber(row["Female Slots"]);
    const maleSlots = parseNumber(row["Male Slots"]);
    if (teamSize === null || femaleSlots === null || maleSlots === null) {
      issues.push({ severity: "error", sheet: "Team Groups", row: rowNum, message: "Team Size, Female Slots, Male Slots must be numbers." });
      return;
    }

    teamGroups.set(name.toLowerCase(), {
      name,
      group_by: groupBy,
      team_size: teamSize,
      confidence: "HIGH",
      warnings: [],
      prizes: [],
    });
    });
  }

  const seenTeamPlace = new Set<string>();
  if (parseV1) {
    const teamPrizeRows = getSheetRows(workbook, "Team Prizes");
    teamPrizeRows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const groupName = normalize(row.Group);
    if (!groupName) return;

    const group = teamGroups.get(groupName.toLowerCase());
    if (!group) {
      issues.push({ severity: "error", sheet: "Team Prizes", row: rowNum, message: `Unknown group "${groupName}".` });
      return;
    }

    const places = parsePlaceRange(row.Place);
    if (!places || places.length === 0) {
      issues.push({ severity: "error", sheet: "Team Prizes", row: rowNum, message: "Invalid Place." });
      return;
    }

    const cashParsed = parseNumber(row["Cash Amount"]);
    if (normalize(row["Cash Amount"]) && cashParsed === null) {
      issues.push({ severity: "error", sheet: "Team Prizes", row: rowNum, message: "Invalid Cash Amount." });
      return;
    }

    const trophyParsed = parseBoolean(row.Trophy);
    const medalParsed = parseBoolean(row.Medal);
    if ((normalize(row.Trophy) && trophyParsed === null) || (normalize(row.Medal) && medalParsed === null)) {
      issues.push({ severity: "error", sheet: "Team Prizes", row: rowNum, message: "Invalid Trophy/Medal values." });
      return;
    }

    for (const place of places) {
      const key = `${group.name.toLowerCase()}:${place}`;
      if (seenTeamPlace.has(key)) {
        issues.push({ severity: "error", sheet: "Team Prizes", row: rowNum, message: `Duplicate place ${place} in group "${group.name}".` });
        continue;
      }
      seenTeamPlace.add(key);
      group.prizes.push(buildPrize(place, cashParsed ?? 0, trophyParsed ?? false, medalParsed ?? false, []));
    }
    });
  }

  const draft: DraftResult = {
    source: "xlsx_template",
    file_path: file.name,
    overall_confidence: "HIGH",
    warnings: issues.filter((i) => i.severity === "warning").map((i) => i.message),
    categories: [...categories.values()],
    team_groups: [...teamGroups.values()],
  };

  return { draft, issues };
}
