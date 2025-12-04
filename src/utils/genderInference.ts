import { HEADER_ALIASES, normalizeHeaderForMatching, findHeaderlessGenderColumn } from './importSchema';
import { genderBlankToMF, normalizeGender } from './valueNormalizers';

export type Gender = 'M' | 'F' | 'Other' | null;
export type GenderSource = 'gender_column' | 'fs_column' | 'headerless_after_name' | 'type_label' | 'group_label';

export interface GenderInference {
  gender: Gender;
  female_signal_source: 'FMG' | 'F_PREFIX' | null;
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

function collectHeaders(rows: Array<Record<string, any>>): string[] {
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

export function analyzeGenderColumns(rows: Array<Record<string, any>>): GenderColumnConfig {
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

  const headerlessGenderColumn = findHeaderlessGenderColumn(headers, rows as Array<Record<string, any>>) || null;

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

const FEMALE_MARKER_REGEX = /^F\d+/;
const FEMALE_TOKENS = new Set(['F', 'FEMALE', 'GIRL']);
const MALE_TOKENS = new Set(['M', 'MALE', 'BOY']);
const tokenizeLabel = (label?: string | null): string[] =>
  String(label ?? '')
    .trim()
    .split(/[\s,;|/]+/)
    .map(token => token.trim())
    .filter(token => token.length > 0);

export const hasFemaleMarker = (label?: string | null): boolean =>
  tokenizeLabel(label).some(token => {
    const upper = token.toUpperCase();
    if (upper.includes('FMG')) return true;
    return FEMALE_MARKER_REGEX.test(upper);
  });

function normalizeExplicitGender(value: unknown): Gender {
  const normalized = normalizeGender(value);
  if (!normalized) return null;

  const upper = String(value ?? '').trim().toUpperCase();
  if (FEMALE_TOKENS.has(upper)) return 'F';
  if (MALE_TOKENS.has(upper)) return 'M';
  return null;
}

function normalizeFsOrHeaderless(value: unknown): Gender {
  const normalized = genderBlankToMF(value);
  if (normalized === 'F') return 'F';
  return null;
}

function detectFemaleSignal(label?: string | null): { isFemale: boolean; reason: 'FMG' | 'F_PREFIX' | null } {
  const tokens = tokenizeLabel(label);
  for (const token of tokens) {
    const upper = token.toUpperCase();
    if (upper.includes('FMG')) return { isFemale: true, reason: 'FMG' };
    if (FEMALE_MARKER_REGEX.test(upper)) return { isFemale: true, reason: 'F_PREFIX' };
  }

  return { isFemale: false, reason: null };
}

export function inferGenderForRow(
  row: Record<string, any>,
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

  const genderColumn = config?.genderColumn ?? (config?.preferredSource === 'gender_column' ? config?.preferredColumn : null);
  const explicitGenderValue = genderColumn ? row[genderColumn] : 'gender' in row ? row.gender : undefined;
  const explicitGender = normalizeExplicitGender(explicitGenderValue);

  if (explicitGender) {
    result.gender = explicitGender;
    result.sources.push('gender_column');
    result.gender_source = 'gender_column';
  }

  const fsGender = normalizeFsOrHeaderless(config?.fsColumn ? row[config.fsColumn] : undefined);
  if (fsGender === 'F') {
    result.gender = 'F';
    result.sources.push('fs_column');
    result.gender_source = 'fs_column';
  }

  const headerlessGender = normalizeFsOrHeaderless(
    config?.headerlessGenderColumn ? row[config.headerlessGenderColumn] : undefined,
  );
  if (headerlessGender === 'F') {
    result.gender = 'F';
    result.sources.push('headerless_after_name');
    result.gender_source = 'headerless_after_name';
  }

  const { isFemale: femaleFromType, reason: typeReason } = detectFemaleSignal(typeLabel);
  const { isFemale: femaleFromGroup, reason: groupReason } = detectFemaleSignal(groupLabel);

  let femaleSignalReason: 'FMG' | 'F_PREFIX' | null = null;

  if (femaleFromType || femaleFromGroup) {
    if (result.gender === 'M') {
      result.warnings.push('female signal overrides explicit male gender');
    }
    result.gender = 'F';
    if (femaleFromType) {
      result.sources.push('type_label');
      result.gender_source = 'type_label';
      femaleSignalReason = femaleSignalReason ?? typeReason ?? null;
    }
    if (femaleFromGroup) {
      result.sources.push('group_label');
      if (!result.gender_source) result.gender_source = 'group_label';
      femaleSignalReason = femaleSignalReason ?? groupReason ?? null;
    }
  }

  result.sources = Array.from(new Set(result.sources));

  if (femaleSignalReason) {
    result.female_signal_source = femaleSignalReason;
  }

  return result;
}

