import { HEADER_ALIASES, normalizeHeaderForMatching, findHeaderlessGenderColumn } from './importSchema';
import { genderBlankToMF, normalizeGender } from './valueNormalizers';

export type Gender = 'M' | 'F' | 'Other' | null;
export type GenderSource = 'gender_column' | 'fs_column' | 'headerless_after_name' | 'type_label' | 'group_label';

export interface GenderInference {
  gender: Gender;
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

const FEMALE_MARKER_REGEX = /^F(?:MG|\d+|[-].+)?$/;
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

function normalizeGenderValue(value: unknown, source: GenderSource | null): Gender {
  if (source === 'fs_column' || source === 'headerless_after_name') {
    return genderBlankToMF(value);
  }

  return normalizeGender(value);
}

export function inferGenderForRow(
  row: Record<string, any>,
  config?: GenderColumnConfig | null,
  typeLabel?: string | null,
  groupLabel?: string | null,
): GenderInference {
  const result: GenderInference = { gender: null, sources: [], warnings: [] };
  const candidates: Array<{ column: string; source: GenderSource }> = [];
  const seenColumns = new Set<string>();

  const addCandidate = (column: string | null | undefined, source: GenderSource) => {
    if (!column || seenColumns.has(column)) return;
    seenColumns.add(column);
    candidates.push({ column, source });
  };

  if (config?.preferredColumn) {
    addCandidate(config.preferredColumn, config.preferredSource ?? 'gender_column');
  }
  addCandidate(config?.genderColumn, 'gender_column');
  addCandidate(config?.fsColumn, 'fs_column');
  addCandidate(config?.headerlessGenderColumn, 'headerless_after_name');

  // Fallback: raw gender column if present
  if (!config?.preferredColumn && 'gender' in row) {
    addCandidate('gender', 'gender_column');
  }

  for (const candidate of candidates) {
    const value = row[candidate.column];
    const normalized = normalizeGenderValue(value, candidate.source);
    if (normalized) {
      result.gender = normalized;
      result.sources.push(candidate.source);
      break;
    }
  }

  const hasFemaleType = hasFemaleMarker(typeLabel);
  const hasFemaleGroup = hasFemaleMarker(groupLabel);

  if (hasFemaleType || hasFemaleGroup) {
    if (result.gender === 'M') {
      result.warnings.push('FMG overrides gender');
    }
    result.gender = 'F';
    if (hasFemaleType) result.sources.push('type_label');
    if (hasFemaleGroup) result.sources.push('group_label');
  }

  result.sources = Array.from(new Set(result.sources));

  return result;
}

