// src/utils/valueNormalizers.ts
// Value normalization for player import (gender, rating, unrated inference)

/**
 * Normalize gender values to M/F only; return null for anything else
 */
export function normalizeGender(raw: unknown): 'M' | 'F' | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const normalized = s.toUpperCase();
  if (['M', 'MALE', 'BOY'].includes(normalized)) return 'M';
  if (['F', 'FEMALE', 'GIRL'].includes(normalized)) return 'F';

  return null;
}

/**
 * Normalize rating values, optionally stripping commas/spaces
 * Returns null for invalid values
 * Coerces 0/"0" to null (treating as unrated)
 */
export function normalizeRating(raw: unknown, stripCommas: boolean = true): number | null {
  if (raw == null) return null;

  let str = String(raw).trim();

  // Strip commas and spaces if configured (e.g., "1,800" or "1 800" → "1800")
  if (stripCommas) {
    str = str.replace(/[,\s]/g, '');
  }

  if (str === '' || str === '0') return null;

  const num = parseFloat(str);

  // Validate: must be positive number (coerce 0 to null)
  if (isNaN(num) || num <= 0) return null;

  return Math.round(num);
}

/**
 * Configuration for unrated inference logic
 */
export interface UnratedInferenceConfig {
  treatEmptyAsUnrated: boolean;    // Treat '', '-', 'NA', 'N/A' as unrated=true
  inferFromMissingRating: boolean; // Infer unrated if rating=0/null AND fide_id missing
}

/**
 * Infer whether a player should be marked as unrated
 * Handles explicit flags + configurable inference from missing data
 * Rule: if rating is null, unrated=true (unless explicit flag says otherwise)
 */
export function inferUnrated(
  player: { 
    rating?: number | null; 
    fide_id?: string | null; 
    unrated?: unknown;
  },
  config: UnratedInferenceConfig
): boolean {
  // If rating > 0, force unrated=false (override inference)
  if (player.rating != null && player.rating > 0) {
    return false;
  }
  
  // Check explicit unrated field
  if (player.unrated != null) {
    const s = String(player.unrated).trim().toLowerCase();
    
    // Explicit truthy values
    if (['y', 'yes', 'true', '1', 'u', 'ur', 'unrated'].includes(s)) {
      return true;
    }
    
    // Explicit falsy values (when rating is null, this overrides default behavior)
    if (['n', 'no', 'false', '0', 'r', 'rated'].includes(s)) {
      return false;
    }
    
    // Configurable: treat empty/dash/NA as unrated
    if (config.treatEmptyAsUnrated && ['', '-', 'na', 'n/a', 'n.a.'].includes(s)) {
      return true;
    }
  }
  
  // Default: if rating is null, unrated=true
  if (player.rating == null) {
    return true;
  }
  
  // Configurable: infer from missing rating + missing FIDE ID
  if (config.inferFromMissingRating) {
    const hasNoRating = !player.rating || player.rating === 0;
    const hasNoFideId = !player.fide_id || player.fide_id.trim() === '';
    
    if (hasNoRating && hasNoFideId) {
      return true;
    }
  }
  
  return false;
}

/** Swiss-Manager: 'F' marks Female; blank/other stays unknown */
export function genderBlankToMF(raw: unknown): 'M' | 'F' | null {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim().toUpperCase();
  if (s === 'F') return 'F';
  return null;
}

/** Swiss-Manager: rating 0 means 'unrated' → store as null */
export function ratingZeroToNull(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).replace(/[,\s]/g, ''));
  if (!isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/** Merge optional title prefix with name (e.g., 'IM' + 'A. Player' → 'IM A. Player') */
export function mergeTitleAndName(title: unknown, name: unknown): string {
  const t = String(title ?? '').trim();
  const n = String(name ?? '').trim();
  if (t && n) return `${t} ${n}`.trim();
  return n || t || '';
}

/** Keep only digits from FIDE-No. cells (e.g., '12345678.' → '12345678') */
export function digitsOnly(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).replace(/\D+/g, '');
  return s || null;
}

/**
 * Normalize Gr column for Swiss-Manager:
 * - Always preserves raw value as group_label (trimmed, case preserved)
 * - "PC" indicates Physically Challenged (backward compatibility)
 * Returns { disability, tags, group_label } tuple for merging into player record
 */
export function normalizeGrColumn(raw: unknown): { 
  disability: string | null; 
  tags: string[]; 
  group_label: string | null;
} {
  if (raw == null) return { disability: null, tags: [], group_label: null };
  
  const trimmed = String(raw).trim();
  if (!trimmed) return { disability: null, tags: [], group_label: null };
  
  const upper = trimmed.toUpperCase();
  
  // PC detection for backward compatibility (disability field)
  if (upper === 'PC' || upper.includes('PC')) {
    return { disability: 'PC', tags: ['PC'], group_label: trimmed };
  }
  
  // All other values: just preserve as group_label
  return { disability: null, tags: [], group_label: trimmed };
}

/**
 * Normalize Type column for Swiss-Manager:
 * - Returns the raw value trimmed, or null if empty
 * - Does NOT interpret semantics (PC, S60, F14, etc. are just strings)
 * - Case is preserved for display, matching is case-insensitive in allocator
 */
export function normalizeTypeColumn(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s;
}

export function fillSingleGapRanksInPlace(
  players: Array<{ rank?: number | null; [key: string]: unknown }>,
): void {
  for (let i = 1; i < players.length - 1; i++) {
    const prev = players[i - 1]?.rank;
    const cur = players[i]?.rank;
    const next = players[i + 1]?.rank;

    if ((cur == null || cur === 0) && Number.isFinite(prev) && Number.isFinite(next)) {
      if ((next as number) - (prev as number) === 2) {
        players[i].rank = (prev as number) + 1;
        players[i]._rank_autofilled = true;
      }
    }
  }
}

export type TieRankImputationGroup = {
  tieAnchorRank: number;
  startRowIndex: number;
  endRowIndex: number;
  imputedRanks: number[];
};

export type TieRankImputationRow = {
  rowIndex: number;
  excelRowNumber?: number;
  tieAnchorRank: number;
  imputedRank: number;
  nextPrintedRank?: number | null;
};

export type TieRankImputationWarning = {
  rowIndex: number;
  excelRowNumber?: number;
  message: string;
};

export type TieRankImputationReport = {
  totalImputed: number;
  groups: TieRankImputationGroup[];
  rows: TieRankImputationRow[];
  warnings: TieRankImputationWarning[];
};

const normalizeRankValue = (value: unknown): number | null => {
  if (value == null) return null;
  const num = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
};

function getExcelRowNumber(row: Record<string, unknown>, rowNumberKey?: string): number | undefined {
  if (!rowNumberKey) return undefined;
  const raw = row[rowNumberKey];
  const value = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  return Number.isFinite(value) ? value : undefined;
}

function ensureImputationFields(row: Record<string, unknown>, rankValue: number | null): void {
  if (row.rank_original === undefined) {
    row.rank_original = rankValue ?? null;
  }
  if (row.rank_imputed === undefined) {
    row.rank_imputed = false;
  }
  if (row.tie_anchor_rank === undefined) {
    row.tie_anchor_rank = null;
  }
}

export function imputeContinuousRanksFromTies<T extends Record<string, unknown>>(
  rows: T[],
  {
    rankKey = "rank",
    rowNumberKey,
  }: {
    rankKey?: string;
    rowNumberKey?: string;
  } = {},
): { rows: T[]; report: TieRankImputationReport } {
  const report: TieRankImputationReport = {
    totalImputed: 0,
    groups: [],
    rows: [],
    warnings: []
  };

  let anchorRank: number | null = null;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const currentRank = normalizeRankValue(row[rankKey]);
    ensureImputationFields(row, currentRank);

    if (currentRank != null) {
      anchorRank = currentRank;
      continue;
    }

    const startIndex = i;
    while (i < rows.length && normalizeRankValue(rows[i][rankKey]) == null) {
      const blankRow = rows[i];
      ensureImputationFields(blankRow, normalizeRankValue(blankRow[rankKey]));
      i += 1;
    }
    const endIndex = i - 1;
    const nextRank = i < rows.length ? normalizeRankValue(rows[i][rankKey]) : null;
    const blankCount = endIndex - startIndex + 1;

    if (anchorRank == null) {
      const excelRowNumber = getExcelRowNumber(rows[startIndex], rowNumberKey);
      report.warnings.push({
        rowIndex: startIndex,
        excelRowNumber,
        message: "Cannot impute rank without anchor."
      });
      i -= 1;
      continue;
    }

    if (nextRank == null || nextRank <= anchorRank) {
      const excelRowNumber = getExcelRowNumber(rows[startIndex], rowNumberKey);
      report.warnings.push({
        rowIndex: startIndex,
        excelRowNumber,
        message: "Cannot impute rank without a following printed rank."
      });
      i -= 1;
      continue;
    }

    const expectedGap = nextRank - anchorRank - 1;
    if (expectedGap !== blankCount) {
      const excelRowNumber = getExcelRowNumber(rows[startIndex], rowNumberKey);
      report.warnings.push({
        rowIndex: startIndex,
        excelRowNumber,
        message: "Cannot impute rank without a continuous tie sequence."
      });
      i -= 1;
      continue;
    }

    const imputedRanks: number[] = [];
    for (let offset = 1; offset <= blankCount; offset += 1) {
      const rowIndex = startIndex + offset - 1;
      // Cast to mutable record for in-place mutation (function is documented as mutating)
      const targetRow = rows[rowIndex] as Record<string, unknown>;
      const imputedRank = anchorRank + offset;
      targetRow[rankKey] = imputedRank;
      targetRow.rank_imputed = true;
      targetRow.tie_anchor_rank = anchorRank;
      imputedRanks.push(imputedRank);
      report.rows.push({
        rowIndex,
        excelRowNumber: getExcelRowNumber(targetRow, rowNumberKey),
        tieAnchorRank: anchorRank,
        imputedRank,
        nextPrintedRank: nextRank
      });
    }

    report.groups.push({
      tieAnchorRank: anchorRank,
      startRowIndex: startIndex,
      endRowIndex: endIndex,
      imputedRanks
    });
    report.totalImputed += blankCount;
    i -= 1;
  }

  return { rows, report };
}
