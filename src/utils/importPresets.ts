// src/utils/importPresets.ts
import {
  mergeTitleAndName,
  ratingZeroToNull,
  digitsOnly,
  normalizeGrColumn,
} from './valueNormalizers';
import { extractStateFromIdent } from './stateExtract';

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

/** Swiss-Manager v2: comprehensive header aliases + PC detection + Ident fallback */
export const SWISS_MANAGER_V2: ImportPreset = {
  id: 'swiss-manager-v2',
  name: 'Swiss-Manager Interim Ranking (v2)',
  description: 'Expanded aliases, Gr=PC→disability, Ident→state fallback, Rtg=0→null.',
  headerRowHint: 18,
  fieldMappings: {
    rank: ['rank', 'rk', 'final_rank', 'position', 'pos'],
    sno: ['sno', 's_no', 'sno.', 'start_no', 'start no', 'seed', 'sr_no', 'startno'],
    name: ['name', 'player_name', 'player'],
    title: ['title', '[title]'],
    rating: ['rtg', 'rtg.', 'rating', 'rtng', 'std', 'elo', 'irtg', 'irtg.', 'nrtg'],
    fide_id: ['fide-no.', 'fide no.', 'fide_no', 'fideno', 'fide_id', 'fide id', 'fid'],
    dob: ['birth', 'dob', 'date_of_birth', 'date of birth', 'b-day'],
    gender: ['gender', 'sex', 'gr', 'fs', 'sx'], // 'gr' can also indicate PC via normalizer
    federation: ['federation', 'fed.', 'fed', 'country'],
    state: ['state', 'ident/state', 'state/ut', 'region'],
    city: ['city', 'town', 'place'],
    club: ['club', 'academy', 'school/club'],
    disability: ['disability', 'physically challenged', 'special group'],
    ident: ['ident', 'identifier'] // New: for state fallback extraction
  },
  normalizers: [
    { field: 'name',   normalize: (_v, row) => mergeTitleAndName(row?.title, row?.name) },
    { field: 'rating', normalize: (v) => ratingZeroToNull(v) },
    { field: 'fide_id',normalize: (v) => digitsOnly(v) },
    // PC detection from Gr column
    { field: 'gr', normalize: (v) => normalizeGrColumn(v) },
    // State fallback from Ident column
    { field: 'state', normalize: (v, row) => {
      const current = String(v ?? '').trim();
      if (current) return current;
      return extractStateFromIdent(String(row?.ident ?? ''));
    } },
  ],
};

export function selectPresetBySource(source?: 'swiss-manager' | 'organizer-template' | 'unknown') {
  if (source === 'swiss-manager') return SWISS_MANAGER_V2;
  if (source === 'organizer-template') return null; // default pipeline works fine
  return null;
}
