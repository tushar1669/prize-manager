// src/utils/importPresets.ts
import { mergeTitleAndName, ratingZeroToNull, genderBlankToMF, digitsOnly } from './valueNormalizers';

export type FieldMap = Record<string, string | string[]>;
export interface FieldNormalizer { field: string; normalize: (value: any, row?: any) => any; }
export interface ImportPreset {
  id: string;
  name: string;
  description?: string;
  /** Optional header row hint for UI; does not overwrite detection */
  headerRowHint?: number;
  /** Column alias overrides for this preset (fallback to HEADER_ALIASES elsewhere) */
  fieldMappings?: FieldMap;
  /** Field-specific normalizers applied after mapping */
  normalizers: FieldNormalizer[];
}

/** Swiss-Manager v2: uses blank gender column (''→M, 'F'→F) and treats Rtg=0 as null */
export const SWISS_MANAGER_V2: ImportPreset = {
  id: 'swiss-manager-v2',
  name: 'Swiss-Manager Interim Ranking (v2)',
  description: 'Uses blank gender column rule and Rtg=0→null; optional Title+Name merge.',
  headerRowHint: 18,
  fieldMappings: {
    // Prefer these if present; empty header for gender will be manually mapped in UI if needed
    rank: ['rank', 'rk', 'position', 'pos'],
    sno: ['sno', 's_no', 'sno.', 'start_no', 'seed', 'sr_no'],
    name: ['name', 'player_name', 'player'],
    title: ['title', '[title]'],
    rating: ['rtg', 'rating', 'std', 'elo', 'irtg', 'nrtg'],
    fide_id: ['fide-no.', 'fide_no', 'fideno', 'fide_id'],
    dob: ['birth', 'dob', 'date_of_birth'],
    gender: ['gender', 'sex'] // NOTE: not 'fs'
  },
  normalizers: [
    { field: 'name',   normalize: (_v, row) => mergeTitleAndName(row?.title, row?.name) },
    { field: 'rating', normalize: (v) => ratingZeroToNull(v) },
    { field: 'gender', normalize: (v) => genderBlankToMF(v) },
    { field: 'fide_id',normalize: (v) => digitsOnly(v) },
  ],
};

export function selectPresetBySource(source?: 'swiss-manager' | 'organizer-template' | 'unknown') {
  if (source === 'swiss-manager') return SWISS_MANAGER_V2;
  if (source === 'organizer-template') return null; // default pipeline works fine
  return null;
}
