import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, hasPingQueryParam, isPingBody, pingResponse } from "../_shared/health.ts";
import { computeTeamScores, type TeamPrizePlayer } from "../_shared/teamPrizes.ts";

const BUILD_VERSION = "2025-12-20T20:00:00Z";
const FUNCTION_NAME = "publicTeamPrizes";
const corsHeaders = CORS_HEADERS;

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

    let publication: { tournament_id: string; is_active: boolean } | null = null;
    if (slug) {
      const { data } = await supabase.from('publications').select('tournament_id, is_active').eq('slug', slug).maybeSingle();
      publication = data as typeof publication;
      tournamentId = tournamentId ?? publication?.tournament_id;
    }

    if (!tournamentId) {
      return new Response(JSON.stringify({ error: 'tournament_id or slug is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!publication) {
      const { data } = await supabase.from('publications').select('tournament_id, is_active').eq('tournament_id', tournamentId).eq('is_active', true).maybeSingle();
      publication = data as typeof publication;
    }

    const { data: tournament } = await supabase.from('tournaments').select('id, is_published').eq('id', tournamentId).maybeSingle();
    if (!tournament?.is_published || !publication?.is_active) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: latestAlloc } = await supabase
      .from('team_allocations')
      .select('version')
      .eq('tournament_id', tournamentId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const latestVersion = (latestAlloc as { version?: number } | null)?.version;

    const { data: groups } = await supabase.from('institution_prize_groups').select('*').eq('tournament_id', tournamentId).eq('is_active', true).order('name');
    const typedGroups = (groups ?? []) as InstitutionPrizeGroup[];
    if (typedGroups.length === 0) {
      return new Response(JSON.stringify({ groups: [], players_loaded: 0, max_rank: 0, hasTeamPrizes: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const groupIds = typedGroups.map((g) => g.id);
    const { data: prizes } = await supabase.from('institution_prizes').select('*').in('group_id', groupIds).eq('is_active', true).order('place');
    const allPrizes = (prizes ?? []) as InstitutionPrize[];

    if (latestVersion != null) {
      const { data: rows } = await supabase
        .from('team_allocations')
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('version', latestVersion)
        .order('group_id')
        .order('place');

      const { data: notes } = await supabase
        .from('team_allocation_notes')
        .select('group_id, note')
        .eq('tournament_id', tournamentId)
        .eq('version', latestVersion);

      const notesByGroup = new Map((notes ?? []).map((n: { group_id: string; note: string }) => [n.group_id, n.note]));
      const rowsByGroup = new Map<string, Array<Record<string, unknown>>>();
      for (const row of (rows ?? []) as Array<Record<string, unknown>>) {
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
                    label: String(winner.institution_label ?? winner.institution_key ?? ''),
                    total_points: Number(winner.total_points ?? 0),
                    rank_sum: Number(winner.rank_sum ?? 0),
                    best_individual_rank: Number(winner.best_individual_rank ?? 0),
                    players: Array.isArray(winner.players_json) ? winner.players_json : [],
                  }
                : null,
            };
          }),
          eligible_institutions: persisted.length,
          ineligible_institutions: 0,
          ineligible_reasons: [],
        };
      });

      return new Response(JSON.stringify({ groups: responseGroups, players_loaded: 0, max_rank: 0, hasTeamPrizes: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fallback to live compute for old tournaments without snapshots
    const { data: players } = await supabase
      .from('players')
      .select('id, name, rank, gender, club, team, points')
      .eq('tournament_id', tournamentId)
      .order('rank');

    const teamPlayers: TeamPrizePlayer[] = ((players ?? []) as Array<Record<string, unknown>>).map((p) => ({
      id: String(p.id),
      name: String(p.name ?? ''),
      rank: Number(p.rank ?? 0),
      points: Number(p.points ?? 0),
      gender: (p.gender as string | null) ?? null,
      club: (p.club as string | null) ?? null,
      team: (p.team as string | null) ?? null,
    }));

    const responseGroups = typedGroups.map((group) => {
      const scored = computeTeamScores(teamPlayers, group.team_size, group.group_by === 'team' ? 'team' : 'club');
      const groupPrizes = allPrizes.filter((p) => p.group_id === group.id);

      return {
        group_id: group.id,
        name: group.name,
        config: {
          group_by: group.group_by,
          team_size: group.team_size,
          female_slots: group.female_slots,
          male_slots: group.male_slots,
          scoring_mode: group.scoring_mode,
        },
        prizes: groupPrizes.map((prize) => {
          const winner = scored[prize.place - 1];
          return {
            id: prize.id,
            place: prize.place,
            cash_amount: prize.cash_amount,
            has_trophy: prize.has_trophy,
            has_medal: prize.has_medal,
            is_active: true,
            winner_institution: winner
              ? {
                  key: winner.key,
                  label: winner.key,
                  total_points: winner.total_points,
                  rank_sum: winner.rank_sum,
                  best_individual_rank: winner.best_individual_rank,
                  players: winner.team.map((p) => ({ player_id: p.id, name: p.name, rank: p.rank, points: p.points, gender: p.gender })),
                }
              : null,
          };
        }),
        eligible_institutions: scored.length,
        ineligible_institutions: 0,
        ineligible_reasons: [],
      };
    });

    return new Response(JSON.stringify({ groups: responseGroups, players_loaded: teamPlayers.length, max_rank: 0, hasTeamPrizes: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
