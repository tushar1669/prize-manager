// src/utils/importSchema.ts
// Centralized header aliases, conflict types, and helper functions for player import
import { ALIASES } from './headerAliases';

export const HEADER_ALIASES = ALIASES;

/**
 * Rating column priority for Swiss-Manager files
 * Prefer Rtg (current rating) over IRtg (initial rating)
 */
export const RATING_COLUMN_PRIORITY = ['rtg', 'irtg', 'nrtg', 'rating', 'elo', 'std'];

/**
 * Unified header normalization for matching
 * Strips punctuation, collapses spaces, converts to lowercase
 * Used consistently across PlayerImport and ColumnMappingDialog
 */
export function normalizeHeaderForMatching(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')  // Remove all punctuation (periods, hyphens, etc.)
    .replace(/\s+/g, '_');     // Collapse spaces to underscore
}

const SWISS_SIGNATURE_HEADERS = ['rank', 'sno', 'rtg', 'fideno'];
const TEMPLATE_SIGNATURE_HEADERS = ['rank', 'name', 'rating', 'dob'];

const HEADERLESS_KEY_PATTERN = /^__empty/i;

/**
 * Strict single-letter gender tokens for headerless column detection
 * Only accept: F, M, B, G (case-insensitive)
 * This prevents false positives from short name columns like "K. Arun"
 */
const STRICT_SINGLE_LETTER_GENDER = new Set(['f', 'm', 'b', 'g']);

function isHeaderlessKey(key: string | undefined): key is string {
  if (key === undefined) return false;
  if (key.trim().length === 0) return true;
  return HEADERLESS_KEY_PATTERN.test(key);
}

/**
 * Check if a value looks like a gender marker for headerless column detection
 * STRICT: Only accepts single letters F, M, B, G (case-insensitive)
 * Does NOT accept words like "Male", "Female", "Boy", "Girl"
 * This prevents short name columns like "K. Arun" from being misidentified
 */
function looksLikeStrictGenderValue(value: unknown): boolean {
  if (value == null) return false;
  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed) return false;
  
  // Must be exactly one letter
  if (trimmed.length !== 1) return false;
  
  return STRICT_SINGLE_LETTER_GENDER.has(trimmed);
}

const NORMALIZED_NAME_HEADERS = new Set(
  HEADER_ALIASES.name.map(normalizeHeaderForMatching)
);

/**
 * Find a headerless gender column (empty header) adjacent to the Name column
 * 
 * Detection criteria:
 * 1. Column header must be empty (or __EMPTY_COL_*)
 * 2. Column must be immediately after the Name column
 * 3. At least one non-empty value must be a SINGLE letter in {F, M, B, G}
 * 4. Majority of non-empty values should match the strict pattern
 * 
 * This strict detection prevents false positives from:
 * - Short name columns (e.g., "K. Arun", "R. Sangma")
 * - Title columns (e.g., "FM", "IM", "GM")
 */
export function findHeaderlessGenderColumn(
  headers: string[],
  sampleRows: Array<Record<string, any>> = []
): string | null {
  if (!Array.isArray(headers) || headers.length === 0) {
    return null;
  }

  if (!Array.isArray(sampleRows) || sampleRows.length === 0) {
    return null;
  }

  const normalizedHeaders = headers.map(normalizeHeaderForMatching);
  let nameIndex = -1;
  for (let i = 0; i < normalizedHeaders.length; i += 1) {
    if (NORMALIZED_NAME_HEADERS.has(normalizedHeaders[i])) {
      nameIndex = i;
      break;
    }
  }

  if (nameIndex === -1) {
    return null;
  }

  const nameHeader = headers[nameIndex];
  const normalizedNameHeader = normalizeHeaderForMatching(nameHeader);
  const candidateStats = new Map<string, { total: number; matches: number }>();

  const registerCandidate = (key: string | undefined) => {
    if (!isHeaderlessKey(key)) return;
    if (!candidateStats.has(key)) {
      candidateStats.set(key, { total: 0, matches: 0 });
    }
  };

  registerCandidate(headers[nameIndex + 1]);

  const sampleLimit = Math.min(sampleRows.length, 25);
  for (let i = 0; i < sampleLimit; i += 1) {
    const row = sampleRows[i];
    if (!row || typeof row !== 'object') continue;

    const keys = Object.keys(row);
    if (keys.length === 0) continue;

    const nameKeyIndex = keys.findIndex(
      (key) => normalizeHeaderForMatching(key) === normalizedNameHeader
    );
    if (nameKeyIndex === -1) continue;

    registerCandidate(keys[nameKeyIndex + 1]);
  }

  if (candidateStats.size === 0) {
    return null;
  }

  for (let i = 0; i < sampleLimit; i += 1) {
    const row = sampleRows[i];
    if (!row || typeof row !== 'object') continue;

    for (const [key, stats] of candidateStats.entries()) {
      const value = (row as Record<string, any>)[key];
      if (value === undefined || value === null) continue;
      const str = String(value).trim();
      if (!str) continue;

      stats.total += 1;
      // Use strict single-letter detection
      if (looksLikeStrictGenderValue(str)) {
        stats.matches += 1;
      }
    }
  }

  let bestKey: string | null = null;
  let bestRatio = 0;
  for (const [key, stats] of candidateStats.entries()) {
    if (stats.matches === 0) continue;
    if (stats.total === 0) continue;

    const ratio = stats.matches / stats.total;
    // Require at least 3 matches OR all values match (for small samples)
    if (
      stats.matches >= 3 ||
      (stats.total <= 3 && stats.matches === stats.total && stats.total >= 2)
    ) {
      if (ratio > bestRatio) {
        bestKey = key;
        bestRatio = ratio;
      }
    }
  }

  return bestKey;
}

export function inferImportSource(
  headers: string[],
  sampleRows: Array<Record<string, any>> = []
): 'swiss-manager' | 'organizer-template' | 'unknown' {
  const normalized = headers.map((header) => normalizeHeaderForMatching(header));

  const headerlessGender = findHeaderlessGenderColumn(headers, sampleRows);

  if (SWISS_SIGNATURE_HEADERS.every((key) => normalized.includes(key)) && headerlessGender) {
    return 'swiss-manager';
  }

  if (TEMPLATE_SIGNATURE_HEADERS.every((key) => normalized.includes(key))) {
    return 'organizer-template';
  }

  return 'unknown';
}

/**
 * Select the best rating column when multiple are present
 * Returns the original column name (preserves case)
 */
export function selectBestRatingColumn(detectedColumns: string[]): string | null {
  const normalized = detectedColumns.map(c => normalizeHeaderForMatching(c));
  
  for (const preferred of RATING_COLUMN_PRIORITY) {
    const idx = normalized.indexOf(normalizeHeaderForMatching(preferred));
    if (idx >= 0) {
      console.log(`[importSchema] Selected rating column: '${detectedColumns[idx]}' (priority: ${preferred})`);
      return detectedColumns[idx]; // Return original case
    }
  }
  
  return null;
}

export type ImportConflictType =
  | 'duplicate_in_file'
  | 'already_exists'
  | 'conflict_different_dob'
  | 'conflict_different_rating';

export interface ImportConflict {
  row: number;
  playerId?: string;
  type: ImportConflictType;
  message: string;
  existingPlayer?: {
    id: string;
    name: string;
    dob?: string | null;
    rating?: number | null;
    fide_id?: string | null;
  };
}

// Normalize name for comparison (lowercase, trim, collapse spaces)
export function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Generate unique key for duplicate detection
export function generatePlayerKey(player: { 
  name: string; 
  dob?: string | null; 
  fide_id?: string | null 
}): string {
  if (player.fide_id) return `fide:${player.fide_id}`;
  if (player.name && player.dob) {
    return `name-dob:${normalizeName(player.name)}|${player.dob}`;
  }
  return `name:${normalizeName(player.name)}`;
}

/**
 * Normalize DOB for API/import
 * Handles: YYYY, YYYY/00/00, YYYY-00-00, YYYY\00\00, full dates
 * Returns: { dob_raw, dob, inferred, inferredReason }
 */
export function normalizeDobForImport(input?: string | null): { 
  dob_raw: string | null; 
  dob: string | null; 
  inferred: boolean;
  inferredReason?: string;
} {
  if (!input) return { dob_raw: null, dob: null, inferred: false };
  
  const raw = String(input).trim();
  if (!raw) return { dob_raw: null, dob: null, inferred: false };
  
  // Pattern 1: Year only (YYYY)
  const yOnlyMatch = /^(\d{4})$/.exec(raw);
  if (yOnlyMatch) {
    const year = yOnlyMatch[1];
    return { 
      dob_raw: raw, 
      dob: `${year}-01-01`, 
      inferred: true,
      inferredReason: 'Year only - assumed Jan 1'
    };
  }
  
  // Pattern 2: YYYY/00/00 or YYYY-00-00 or YYYY\00\00
  const yZeroMatch = /^(\d{4})[\\/\-]00[\\/\-]00$/.exec(raw);
  if (yZeroMatch) {
    const year = yZeroMatch[1];
    return {
      dob_raw: raw,
      dob: `${year}-01-01`,
      inferred: true,
      inferredReason: 'Unknown month/day - assumed Jan 1'
    };
  }

  // Pattern 3: YYYY/MM/00 where month present but day missing
  const yearMonthOnlyMatch = /^(\d{4})[\\/\-](\d{2})[\\/\-]00$/.exec(raw);
  if (yearMonthOnlyMatch) {
    const year = yearMonthOnlyMatch[1];
    const month = yearMonthOnlyMatch[2];
    if (month !== '00') {
      return {
        dob_raw: raw,
        dob: `${year}-${month}-01`,
        inferred: true,
        inferredReason: 'Unknown day - assumed first of month'
      };
    }
  }

  // Pattern 4: Full date - normalize separators
  const normalized = raw.replace(/\//g, '-').replace(/\\/g, '-');
  
  // Validate full date format
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return { 
      dob_raw: raw, 
      dob: normalized, 
      inferred: false 
    };
  }
  
  // Invalid format - let validation catch it
  return { 
    dob_raw: raw, 
    dob: null, 
    inferred: false 
  };
}
