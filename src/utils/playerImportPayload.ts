import type { PlayerImportRow } from '@/lib/validations';
import type { Json } from '@/integrations/supabase/types';

const SUPABASE_PLAYER_FIELDS = [
  'rank',
  'sno',
  'name',
  'rating',
  'dob',
  'dob_raw',
  'gender',
  'state',
  'city',
  'club',
  'disability',
  'special_notes',
  'fide_id',
  'unrated',
  'federation'
] as const;

export type SupabasePlayerPayload = {
  rank: number;
  sno: string | null;
  name: string;
  rating: number | null;
  dob: string | null;
  dob_raw: string | null;
  gender: string | null;
  state: string | null;
  city: string | null;
  club: string | null;
  disability: string | null;
  special_notes: string | null;
  fide_id: string | null;
  unrated: boolean;
  federation: string | null;
  tournament_id: string;
  tags_json: Json;
  warnings_json: Json;
};

export interface ParsedPlayer extends PlayerImportRow {
  _originalIndex: number;
  fide_id?: string | null;
  federation?: string | null;
  dob_raw?: string | null;
  _dobInferred?: boolean;
  _dobInferredReason?: string;
  _rawUnrated?: unknown;
  _rank_autofilled?: boolean;
  [key: string]: unknown;
}

export const toNumericFideOrNull = (v: unknown): string | null => {
  const s = String(v ?? '').replace(/\D/g, '').trim();
  return s && /^[0-9]{6,10}$/.test(s) ? s : null;
};

const pick = (obj: Record<string, any>, keys: readonly string[]) =>
  keys.reduce((acc, k) => {
    if (k in obj) acc[k] = obj[k];
    return acc;
  }, {} as Record<string, any>);

export function buildSupabasePlayerPayload(
  player: ParsedPlayer,
  tournamentId: string,
): SupabasePlayerPayload {
  const picked = pick(player as Record<string, any>, SUPABASE_PLAYER_FIELDS);
  const finalRating = picked.rating != null ? Number(picked.rating) : null;
  const normalizedUnrated = finalRating != null && finalRating > 0
    ? false
    : (typeof picked.unrated === 'boolean'
        ? picked.unrated
        : picked.unrated == null
          ? true
          : Boolean(picked.unrated));

  return {
    rank: Number(player.rank),
    sno: picked.sno != null ? String(picked.sno) : null,
    name: String(player.name || ''),
    rating: finalRating,
    dob: picked.dob || null,
    dob_raw: picked.dob_raw || picked.dob || null,
    gender: picked.gender || null,
    state: picked.state || null,
    city: picked.city || null,
    club: picked.club || null,
    disability: picked.disability || null,
    special_notes: picked.special_notes || null,
    fide_id: toNumericFideOrNull(picked.fide_id),
    unrated: normalizedUnrated,
    federation: picked.federation || null,
    tournament_id: tournamentId,
    tags_json: {},
    warnings_json: {},
  };
}
