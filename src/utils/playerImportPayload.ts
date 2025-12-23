import type { PlayerImportRow } from '@/lib/validations';
import type { Json } from '@/integrations/supabase/types';
import { ALIASES } from './headerAliases';
import { normalizeGrColumn, normalizeTypeColumn } from './valueNormalizers';
import { extractStateFromIdent } from './stateExtract';

export type SupabasePlayerPayload = {
  rank: number;
  sno: string | null;
  name: string;
  full_name: string | null;
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
  full_name?: string | null;
  fide_id?: string | null;
  federation?: string | null;
  dob_raw?: string | null;
  _dobInferred?: boolean;
  _dobInferredReason?: string;
  _rawUnrated?: unknown;
  _rank_autofilled?: boolean;
  group_label?: string | null;
  type_label?: string | null;
  tags_json?: Json;
  warnings_json?: Json;
  _genderWarnings?: string[];
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
        const value = (player as Record<string, unknown>)[actualKey];
        if (value !== undefined) return value;
      }
    }
    return undefined;
  };

  const rank = getAliasedValue('rank') ?? player.rank;
  const sno = getAliasedValue('sno') ?? player.sno;
  const name = getAliasedValue('name') ?? player.name;
  const fullNameRaw = getAliasedValue('full_name') ?? player.full_name;
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
  // PREFER already-computed group_label/type_label from PlayerImport.tsx
  // Only recalculate from raw 'gr'/'type' aliases if player fields are missing
  const existingGroupLabel = player.group_label;
  const existingTypeLabel = player.type_label;
  
  const grInfo = existingGroupLabel !== undefined 
    ? { disability: existingGroupLabel?.toUpperCase?.() === 'PC' ? 'PC' : null, tags: existingGroupLabel?.toUpperCase?.() === 'PC' ? ['PC'] : [], group_label: existingGroupLabel }
    : normalizeGrColumn(getAliasedValue('gr'));
  const typeLabel = existingTypeLabel !== undefined 
    ? existingTypeLabel 
    : normalizeTypeColumn(getAliasedValue('type'));

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

  const finalFullName = (() => {
    if (fullNameRaw != null && String(fullNameRaw).trim() !== '') {
      return String(fullNameRaw);
    }
    if (name != null && String(name).trim() !== '') {
      return String(name);
    }
    return null;
  })();
  const normalizedUnrated = finalRating != null && finalRating > 0
    ? false
    : (typeof unrated === 'boolean'
        ? unrated
        : unrated == null
          ? true
          : Boolean(unrated));

  // Merge tags_json.special_group when disability=PC detected from Gr column
  const baseTags = typeof player.tags_json === 'object' && player.tags_json !== null ? player.tags_json : {};
  const tags = { ...(baseTags as Record<string, unknown>) };
  const specialGroup = tags.special_group;
  const existingGroups = Array.isArray(specialGroup) ? specialGroup : [];
  const mergedGroups = new Set<string>(
    existingGroups.filter((group): group is string => typeof group === 'string')
  );

  const disability = grInfo.disability ?? disabilityFromField ?? null;
  grInfo.tags.forEach(tag => mergedGroups.add(tag));
  if (disability === 'PC') {
    mergedGroups.add('PC');
  }
  if (mergedGroups.size > 0) {
    tags.special_group = Array.from(mergedGroups);
  }

  const warningsSource = player.warnings_json ?? {};
  const warningsObject =
    typeof warningsSource === 'object' && warningsSource !== null
      ? (warningsSource as Record<string, unknown>)
      : {};
  const genderWarnings = player._genderWarnings;
  if (genderWarnings?.length) {
    warningsObject.gender = genderWarnings;
  }

  return {
    rank: Number(rank),
    sno: sno != null ? String(sno) : null,
    name: String(name || ''),
    full_name: finalFullName,
    rating: finalRating,
    dob: dob ? String(dob) : null,
    dob_raw: dobRaw ? String(dobRaw) : null,
    gender: gender ? String(gender) : null,
    state: state ? String(state) : null,
    city: city ? String(city) : null,
    club: club ? String(club) : null,
    disability: disability != null ? String(disability) : null,
    special_notes: specialNotes ? String(specialNotes) : null,
    fide_id: toNumericFideOrNull(fideId),
    unrated: normalizedUnrated,
    federation: federation ? String(federation) : null,
    tournament_id: tournamentId,
    tags_json: tags as Json,
    warnings_json: warningsObject as Json,
    group_label: grInfo.group_label,
    type_label: typeLabel,
  };
}
