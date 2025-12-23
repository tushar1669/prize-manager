// src/utils/genderInference.ts
// Gender inference logic for player import
import { HEADER_ALIASES, normalizeHeaderForMatching, findHeaderlessGenderColumn } from './importSchema';

export type Gender = 'M' | 'F' | 'Other' | null;
export type GenderSource = 'gender_column' | 'fs_column' | 'headerless_after_name' | 'type_label' | 'group_label';

export interface GenderInference {
  gender: Gender;
  female_signal_source: 'FMG' | 'F_PREFIX' | 'FS_SIGNAL' | 'TITLE' | 'GIRL_TOKEN' | null;
  gender_source: GenderSource | null;
  sources: GenderSource[];
  warnings: string[];
}

export interface GenderColumnConfig {
  genderColumn: string | null;
  fsColumn: string | null;
  headerlessGenderColumn: string | null;
  preferredColumn: string | null;
  preferredSource: GenderSource | null;
}

function collectHeaders(rows: Array<Record<string, unknown>>): string[] {
  const headers: string[] = [];
  const seen = new Set<string>();

  rows.forEach(row => {
    if (!row || typeof row !== 'object') return;
    Object.keys(row).forEach(key => {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    });
  });

  return headers;
}

export function analyzeGenderColumns(rows: Array<Record<string, unknown>>): GenderColumnConfig {
  const headers = collectHeaders(rows);
  const normalized = headers.map(normalizeHeaderForMatching);
  const genderAliases = (HEADER_ALIASES.gender || []).map(normalizeHeaderForMatching);
  const fsToken = normalizeHeaderForMatching('fs');

  let genderColumn: string | null = null;
  let fsColumn: string | null = null;

  normalized.forEach((key, idx) => {
    if (genderAliases.includes(key) && key !== fsToken && !genderColumn) {
      genderColumn = headers[idx];
    }
    if (key === fsToken && !fsColumn) {
      fsColumn = headers[idx];
    }
  });

  const headerlessGenderColumn = findHeaderlessGenderColumn(headers, rows as Array<Record<string, unknown>>) || null;

  const preferredColumn = genderColumn || fsColumn || headerlessGenderColumn || null;
  let preferredSource: GenderSource | null = null;
  if (preferredColumn) {
    if (preferredColumn === genderColumn) {
      preferredSource = 'gender_column';
    } else if (preferredColumn === fsColumn) {
      preferredSource = 'fs_column';
    } else if (preferredColumn === headerlessGenderColumn) {
      preferredSource = 'headerless_after_name';
    }
  }

  return {
    genderColumn,
    fsColumn,
    headerlessGenderColumn,
    preferredColumn,
    preferredSource,
  };
}

// Female markers in Type/Group labels
const FEMALE_MARKER_FMG = /FMG/i;
const FEMALE_MARKER_F_PREFIX = /^F\d{1,2}$/; // F9, F13, etc.
const FEMALE_TOKENS = new Set(['GIRL', 'GIRLS']);

// Explicit gender column values
const EXPLICIT_FEMALE_TOKENS = new Set(['F', 'FEMALE', 'GIRL', 'GIRLS']);
const EXPLICIT_MALE_TOKENS = new Set(['M', 'MALE', 'BOY', 'BOYS']);

// FS/Headerless female signals (female-only column)
// Includes: F, G, W, GIRL, GIRLS, WFM, WIM, WGM, WCM
const FS_FEMALE_EXACT = new Set(['F', 'G', 'W', 'GIRL', 'GIRLS']);
const FS_FEMALE_TITLE_PREFIXES = ['WFM', 'WIM', 'WGM', 'WCM'];

// Chess title prefixes that are NOT gender markers (avoid false positives)
const NON_GENDER_TITLES = new Set(['FM', 'IM', 'GM', 'CM', 'AGM', 'AFM', 'NM', 'AM']);

const tokenizeLabel = (label?: string | null): string[] =>
  String(label ?? '')
    .trim()
    .split(/[\s,;|/]+/)
    .map(token => token.trim())
    .filter(token => token.length > 0);

export const hasFemaleMarker = (label?: string | null): boolean =>
  tokenizeLabel(label).some(token => {
    const upper = token.toUpperCase();
    if (FEMALE_MARKER_FMG.test(upper)) return true;
    if (FEMALE_MARKER_F_PREFIX.test(upper)) return true;
    if (FEMALE_TOKENS.has(upper)) return true;
    return false;
  });

/**
 * Normalize explicit gender column value to M/F
 * Handles: M, MALE, BOY, BOYS, F, FEMALE, GIRL, GIRLS
 */
function normalizeExplicitGender(value: unknown): Gender {
  if (value == null) return null;
  const upper = String(value).trim().toUpperCase();
  if (!upper) return null;

  if (EXPLICIT_FEMALE_TOKENS.has(upper)) return 'F';
  if (EXPLICIT_MALE_TOKENS.has(upper)) return 'M';
  return null;
}

/**
 * Check if FS/headerless column value indicates female
 * Swiss-Manager FS column: F means female, blank means unknown (not male)
 * Also handles: G, W, GIRL, GIRLS, WFM, WIM, WGM, WCM prefixes
 * NEVER treats FM, IM, GM, CM, AGM, AFM as gender
 */
function isFsOrHeaderlessFemale(value: unknown): { isFemale: boolean; reason: 'FS_SIGNAL' | 'TITLE' | null } {
  if (value == null) return { isFemale: false, reason: null };
  const trimmed = String(value).trim();
  if (!trimmed) return { isFemale: false, reason: null };
  
  const upper = trimmed.toUpperCase();
  
  // Check exact matches first (F, G, W, GIRL, GIRLS)
  if (FS_FEMALE_EXACT.has(upper)) {
    return { isFemale: true, reason: 'FS_SIGNAL' };
  }
  
  // Check title prefixes (WFM, WIM, WGM, WCM)
  for (const prefix of FS_FEMALE_TITLE_PREFIXES) {
    if (upper.startsWith(prefix)) {
      return { isFemale: true, reason: 'TITLE' };
    }
  }
  
  // Explicitly reject non-gender chess titles to avoid false positives
  for (const title of NON_GENDER_TITLES) {
    if (upper === title || upper.startsWith(title + ' ')) {
      return { isFemale: false, reason: null };
    }
  }
  
  return { isFemale: false, reason: null };
}

/**
 * Detect female signal from Type or Group label
 * Returns reason: FMG, F_PREFIX, or GIRL_TOKEN
 */
function detectFemaleSignalFromLabel(label?: string | null): { 
  isFemale: boolean; 
  reason: 'FMG' | 'F_PREFIX' | 'GIRL_TOKEN' | null 
} {
  const tokens = tokenizeLabel(label);
  for (const token of tokens) {
    const upper = token.toUpperCase();
    
    // FMG marker
    if (FEMALE_MARKER_FMG.test(upper)) {
      return { isFemale: true, reason: 'FMG' };
    }
    
    // F prefix (F9, F13, etc.)
    if (FEMALE_MARKER_F_PREFIX.test(upper)) {
      return { isFemale: true, reason: 'F_PREFIX' };
    }
    
    // GIRL/GIRLS token
    if (FEMALE_TOKENS.has(upper)) {
      return { isFemale: true, reason: 'GIRL_TOKEN' };
    }
  }

  return { isFemale: false, reason: null };
}

/**
 * Infer gender for a player row using all available signals
 * 
 * Priority (strongest to weakest source):
 * 1. Explicit gender column (F/M/FEMALE/MALE/GIRL/BOY/GIRLS/BOYS)
 * 2. FS column / headerless gender column (F, G, W, WFM, WIM, WGM, WCM, GIRL, GIRLS)
 * 3. Type/Group female markers (FMG, F9, F13, GIRL, GIRLS)
 * 
 * Rules:
 * - Any female signal → return F
 * - Only explicit male (M, MALE, BOY, BOYS) → return M
 * - Otherwise → return null (unknown)
 * - Female signals override explicit male (with warning)
 */
export function inferGenderForRow(
  row: Record<string, unknown>,
  config?: GenderColumnConfig | null,
  typeLabel?: string | null,
  groupLabel?: string | null,
): GenderInference {
  const result: GenderInference = {
    gender: null,
    female_signal_source: null,
    gender_source: null,
    sources: [],
    warnings: [],
  };

  let explicitMale = false;

  // 1. Check explicit gender column
  const genderColumn = config?.genderColumn ?? (config?.preferredSource === 'gender_column' ? config?.preferredColumn : null);
  const explicitGenderValue = genderColumn ? row[genderColumn] : ('gender' in row ? row.gender : undefined);
  const explicitGender = normalizeExplicitGender(explicitGenderValue);

  if (explicitGender === 'F') {
    result.gender = 'F';
    result.sources.push('gender_column');
    result.gender_source = 'gender_column';
  } else if (explicitGender === 'M') {
    explicitMale = true;
    result.gender = 'M';
    result.sources.push('gender_column');
    result.gender_source = 'gender_column';
  }

  // 2. Check FS column (female-only signal)
  const fsValue = config?.fsColumn ? row[config.fsColumn] : undefined;
  const { isFemale: fsFemale, reason: fsReason } = isFsOrHeaderlessFemale(fsValue);
  if (fsFemale) {
    if (explicitMale) {
      result.warnings.push('female signal overrides explicit male gender');
    }
    result.gender = 'F';
    result.sources.push('fs_column');
    result.gender_source = 'fs_column';
    result.female_signal_source = result.female_signal_source ?? fsReason;
  }

  // 3. Check headerless gender column (female-only signal)
  const headerlessValue = config?.headerlessGenderColumn ? row[config.headerlessGenderColumn] : undefined;
  const { isFemale: headerlessFemale, reason: headerlessReason } = isFsOrHeaderlessFemale(headerlessValue);
  if (headerlessFemale) {
    if (result.gender === 'M' && !result.sources.includes('fs_column')) {
      result.warnings.push('female signal overrides explicit male gender');
    }
    result.gender = 'F';
    result.sources.push('headerless_after_name');
    result.gender_source = 'headerless_after_name';
    result.female_signal_source = result.female_signal_source ?? headerlessReason;
  }

  // 4. Check Type label for female markers
  const { isFemale: femaleFromType, reason: typeReason } = detectFemaleSignalFromLabel(typeLabel);
  if (femaleFromType) {
    if (result.gender === 'M' && !result.sources.includes('fs_column') && !result.sources.includes('headerless_after_name')) {
      result.warnings.push('female signal overrides explicit male gender');
    }
    result.gender = 'F';
    result.sources.push('type_label');
    if (!result.gender_source || result.gender_source === 'gender_column') {
      result.gender_source = 'type_label';
    }
    result.female_signal_source = result.female_signal_source ?? typeReason;
  }

  // 5. Check Group label for female markers
  const { isFemale: femaleFromGroup, reason: groupReason } = detectFemaleSignalFromLabel(groupLabel);
  if (femaleFromGroup) {
    if (result.gender === 'M' && !result.sources.includes('fs_column') && !result.sources.includes('headerless_after_name') && !result.sources.includes('type_label')) {
      result.warnings.push('female signal overrides explicit male gender');
    }
    result.gender = 'F';
    result.sources.push('group_label');
    if (!result.gender_source || result.gender_source === 'gender_column') {
      result.gender_source = 'group_label';
    }
    result.female_signal_source = result.female_signal_source ?? groupReason;
  }

  // Dedupe sources
  result.sources = Array.from(new Set(result.sources));

  return result;
}
