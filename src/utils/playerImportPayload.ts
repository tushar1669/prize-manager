import type { PlayerImportRow } from '@/lib/validations';
import type { Json } from '@/integrations/supabase/types';
import { ALIASES } from './headerAliases';
import { normalizeGrColumn, normalizeTypeColumn } from './valueNormalizers';
import { extractStateFromIdent } from './stateExtract';

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
  group_label: string | null;
  type_label: string | null;
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

export function buildSupabasePlayerPayload(
  player: ParsedPlayer,
  tournamentId: string,
): SupabasePlayerPayload {
  const lowerKeyMap = new Map<string, string>();
  Object.keys(player).forEach(key => {
    lowerKeyMap.set(key.toLowerCase(), key);
  });

  const getAliasedValue = (field: keyof typeof ALIASES | string) => {
    const aliases = ALIASES[field as keyof typeof ALIASES] ?? [field];
    for (const alias of aliases) {
      const actualKey = lowerKeyMap.get(alias.toLowerCase());
      if (actualKey && actualKey in player) {
        const value = (player as Record<string, any>)[actualKey];
        if (value !== undefined) return value;
      }
    }
    return undefined;
  };

  const rank = getAliasedValue('rank') ?? player.rank;
  const sno = getAliasedValue('sno') ?? player.sno;
  const name = getAliasedValue('name') ?? player.name;
  const ratingValue = getAliasedValue('rating') ?? player.rating;
  const dob = getAliasedValue('dob') ?? player.dob;
  const dobRaw = getAliasedValue('dob_raw') ?? player.dob_raw ?? dob;
  const gender = getAliasedValue('gender') ?? player.gender;
  let state = getAliasedValue('state') ?? player.state;
  const city = getAliasedValue('city') ?? player.city;
  const club = getAliasedValue('club') ?? player.club;
  const disabilityFromField = getAliasedValue('disability') ?? player.disability;
  const specialNotes = getAliasedValue('special_notes') ?? player.special_notes;
  const fideId = getAliasedValue('fide_id') ?? player.fide_id;
  const unrated = getAliasedValue('unrated');
  const federation = getAliasedValue('federation') ?? player.federation;
  const ident = getAliasedValue('ident');
  const grInfo = normalizeGrColumn(getAliasedValue('gr'));
  const typeLabel = normalizeTypeColumn(getAliasedValue('type'));

  if ((!state || String(state).trim() === '') && ident) {
    const extracted = extractStateFromIdent(String(ident));
    if (extracted) {
      state = extracted;
    }
  }

  const finalRatingCandidate =
    ratingValue != null && ratingValue !== '' ? Number(ratingValue) : null;
  const finalRating = typeof finalRatingCandidate === 'number'
    && Number.isFinite(finalRatingCandidate)
    ? finalRatingCandidate
    : null;
  const normalizedUnrated = finalRating != null && finalRating > 0
    ? false
    : (typeof unrated === 'boolean'
        ? unrated
        : unrated == null
          ? true
          : Boolean(unrated));

  // Merge tags_json.special_group when disability=PC detected from Gr column
  const tags = { ...(player.tags_json as object || {}) };
  const existingGroups = Array.isArray((tags as any).special_group)
    ? (tags as any).special_group
    : [];
  const mergedGroups = new Set<string>(existingGroups);

  const disability = grInfo.disability ?? disabilityFromField ?? null;
  grInfo.tags.forEach(tag => mergedGroups.add(tag));
  if (disability === 'PC') {
    mergedGroups.add('PC');
  }
  if (mergedGroups.size > 0) {
    (tags as any).special_group = Array.from(mergedGroups);
  }

  const warnings: Json = ((player as any).warnings_json as Json) ?? {};
  const genderWarnings = (player as any)._genderWarnings as string[] | undefined;
  if (genderWarnings?.length) {
    (warnings as any).gender = genderWarnings;
  }

  return {
    rank: Number(rank),
    sno: sno != null ? String(sno) : null,
    name: String(name || ''),
    rating: finalRating,
    dob: dob || null,
    dob_raw: dobRaw || null,
    gender: gender || null,
    state: state || null,
    city: city || null,
    club: club || null,
    disability,
    special_notes: specialNotes || null,
    fide_id: toNumericFideOrNull(fideId),
    unrated: normalizedUnrated,
    federation: federation || null,
    tournament_id: tournamentId,
    tags_json: tags,
    warnings_json: warnings,
    group_label: grInfo.group_label,
    type_label: typeLabel,
  };
}
