/**
 * publicTeamPrizes — public read path for team / institution prize results.
 *
 * TC0 (5 Sep 2026) — TWO defects fixed here.
 *
 * 1. WRONG VERSION NUMBER. This function pinned to `publications.version`, which
 *    counts PUBLISHES. Team snapshots are written by `finalize` at the
 *    ALLOCATIONS version. Those two counters disagreed on 24 of 35 active
 *    publications when measured, so the snapshot lookup usually missed.
 *    Now pins to `publications.allocation_version` (added by B18-a), which means
 *    exactly "this publication displays results version N".
 *
 * 2. LIVE-COMPUTE FALLBACK REMOVED. When the snapshot lookup missed, the old
 *    code recomputed team standings from the CURRENT `players` table at request
 *    time. Because of defect 1 that miss was the normal case, not the exception
 *    — so published team results silently tracked live player data. Correcting a
 *    player's club spelling could change a result already announced. That is the
 *    exact defect B18 removed for individual prizes; it survived here because
 *    B18 only fixed `get_public_tournament_results`, and this page reads team
 *    prizes through this function instead.
 *
 * WHAT REPLACES THE FALLBACK. Nothing is invented. If there is no snapshot at
 * the pinned version — or the pin is NULL, meaning the tournament was published
 * before it had results (B18 Option C) — the prize structure is returned with
 * `winner_institution: null` on every place. That is an explicit empty state the
 * UI already renders, because the persisted branch has always emitted null for a
 * place with no row. A blank or invented answer would violate D32.
 *
 * CONSEQUENCE, STATED PLAINLY: a tournament whose team snapshot is missing now
 * shows its team prizes with no winners, instead of showing computed winners
 * that were never published. Repair path is `backfillTeamAllocations`.
 *
 * This function no longer imports the team scorer at all. Reading published
 * results and computing them are now separate concerns.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, hasPingQueryParam, isPingBody, pingResponse } from "../_shared/health.ts";

const BUILD_VERSION = "2026-09-05T20:00:00Z-TC0d";
const FUNCTION_NAME = "publicTeamPrizes";
const corsHeaders = CORS_HEADERS;

interface PublicationRow {
  tournament_id: string;
  is_active: boolean;
  version: number;
  // TC0: the allocation version this publication displays. NULL is legitimate.
  allocation_version: number | null;
}

interface InstitutionPrizeGroup {
  id: string;
  name: string;
  group_by: string;
  team_size: number;
  female_slots: number;
  male_slots: number;
  scoring_mode: string;
}

interface InstitutionPrize {
  id: string;
  group_id: string;
  place: number;
  cash_amount: number;
  has_trophy: boolean;
  has_medal: boolean;
}

interface PlayerSnapshot {
  player_id: string;
  name: string;
  rank: number;
  points: number;
  gender: string | null;
}

const PUBLICATION_COLUMNS = "tournament_id, is_active, version, allocation_version";

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (hasPingQueryParam(req)) return pingResponse(FUNCTION_NAME, BUILD_VERSION);

  const rawBody = await req.text();
  if (isPingBody(rawBody)) return pingResponse(FUNCTION_NAME, BUILD_VERSION);

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const body = JSON.parse(rawBody || '{}');
    let tournamentId = body.tournament_id as string | undefined;
    const slug = body.slug as string | undefined;

    let publication: PublicationRow | null = null;
    if (slug) {
      const { data } = await supabase
        .from('publications')
        .select(PUBLICATION_COLUMNS)
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();
      publication = data as PublicationRow | null;
      tournamentId = publication?.tournament_id;
    }

    if (!tournamentId) {
      return new Response(JSON.stringify({ error: 'tournament_id or slug is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!publication) {
      const { data } = await supabase
        .from('publications')
        .select(PUBLICATION_COLUMNS)
        .eq('tournament_id', tournamentId)
        .eq('is_active', true)
        .maybeSingle();
      publication = data as PublicationRow | null;
    }

    const { data: tournament } = await supabase.from('tournaments').select('id, is_published').eq('id', tournamentId).maybeSingle();
    if (!tournament?.is_published || !publication?.is_active) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // TC0: pin to the ALLOCATION version this publication displays, not to
    // publications.version. NULL means "published before results existed" and is
    // handled below as an empty result, never as a reason to compute one.
    const pinnedVersion: number | null = publication.allocation_version ?? null;

    const { data: groups } = await supabase.from('institution_prize_groups').select('*').eq('tournament_id', tournamentId).eq('is_active', true).order('name');
    const typedGroups = (groups ?? []) as InstitutionPrizeGroup[];
    if (typedGroups.length === 0) {
      return new Response(JSON.stringify({ groups: [], players_loaded: 0, max_rank: 0, hasTeamPrizes: false, pinned_version: pinnedVersion }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const groupIds = typedGroups.map((g) => g.id);
    const { data: prizes } = await supabase.from('institution_prizes').select('*').in('group_id', groupIds).eq('is_active', true).order('place');
    const allPrizes = (prizes ?? []) as InstitutionPrize[];

    // Read the persisted snapshot at the pinned version. A NULL pin cannot match
    // any row, so the queries are skipped entirely rather than issued with null.
    let rows: Array<Record<string, unknown>> = [];
    let notesByGroup = new Map<string, string>();

    if (pinnedVersion !== null) {
      const { data: snapshotRows } = await supabase
        .from('team_allocations')
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('version', pinnedVersion)
        .order('group_id')
        .order('place');
      rows = (snapshotRows ?? []) as Array<Record<string, unknown>>;

      const { data: notes } = await supabase
        .from('team_allocation_notes')
        .select('group_id, note')
        .eq('tournament_id', tournamentId)
        .eq('version', pinnedVersion);
      notesByGroup = new Map((notes ?? []).map((n: { group_id: string; note: string }) => [n.group_id, n.note]));
    }

    const rowsByGroup = new Map<string, Array<Record<string, unknown>>>();
    for (const row of rows) {
      const key = String(row.group_id);
      rowsByGroup.set(key, [...(rowsByGroup.get(key) ?? []), row]);
    }

    const responseGroups = typedGroups.map((group) => {
      const persisted = rowsByGroup.get(group.id) ?? [];
      const prizeMap = new Map<number, Record<string, unknown>>(persisted.map((r) => [Number(r.place), r]));
      const groupPrizes = allPrizes.filter((p) => p.group_id === group.id);

      return {
        group_id: group.id,
        name: group.name,
        note: notesByGroup.get(group.id) ?? null,
        config: {
          group_by: group.group_by,
          team_size: group.team_size,
          female_slots: group.female_slots,
          male_slots: group.male_slots,
          scoring_mode: group.scoring_mode,
        },
        prizes: groupPrizes.map((prize) => {
          const winner = prizeMap.get(prize.place);
          // Derive display values from player_snapshot (real DB columns only)
          const snapshot = winner ? (Array.isArray(winner.player_snapshot) ? winner.player_snapshot as PlayerSnapshot[] : []) : [];
          const rankSum = snapshot.reduce((sum, p) => sum + (p.rank ?? 0), 0);
          const bestRank = snapshot.length > 0 ? Math.min(...snapshot.map((p) => p.rank ?? Infinity)) : 0;

          return {
            id: prize.id,
            place: prize.place,
            cash_amount: prize.cash_amount,
            has_trophy: prize.has_trophy,
            has_medal: prize.has_medal,
            is_active: true,
            winner_institution: winner
              ? {
                  key: String(winner.institution_key ?? ''),
                  label: String(winner.institution_key ?? ''),
                  total_points: Number(winner.total_points ?? 0),
                  rank_sum: rankSum,
                  best_individual_rank: bestRank,
                  players: snapshot.map((p) => ({ player_id: p.player_id, name: p.name, rank: p.rank, points: p.points, gender: p.gender })),
                }
              : null,
          };
        }),
        eligible_institutions: persisted.length,
        ineligible_institutions: 0,
        ineligible_reasons: [],
      };
    });

    return new Response(JSON.stringify({
      groups: responseGroups,
      players_loaded: 0,
      max_rank: 0,
      hasTeamPrizes: true,
      // TC0: exposed so a deploy can be verified without reading the bundle.
      pinned_version: pinnedVersion,
      snapshot_rows: rows.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[publicTeamPrizes] Error:', error);
    return new Response(JSON.stringify({ error: 'internal_server_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
