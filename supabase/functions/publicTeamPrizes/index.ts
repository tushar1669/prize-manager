import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, hasPingQueryParam, isPingBody, pingResponse } from "../_shared/health.ts";
import {
  buildTeam,
  compareInstitutions,
  getRankPoints,
  isFemale,
  type TeamPrizePlayer,
} from "../_shared/teamPrizes.ts";

const BUILD_VERSION = "2025-12-20T20:00:00Z";
const FUNCTION_NAME = "publicTeamPrizes";

const corsHeaders = CORS_HEADERS;

// Team prize scoring logic lives in _shared/teamPrizes.ts to prevent drift.

/**
 * Public Team Prizes Endpoint
 * 
 * Returns team prize allocations for PUBLISHED tournaments only.
 * No authentication required - but only works for published tournaments.
 */

interface Player {
  id: string;
  name: string;
  rank: number;
  gender: string | null;
  club: string | null;
  city: string | null;
  state: string | null;
  group_label: string | null;
  type_label: string | null;
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

const GROUP_BY_COLUMN_MAP: Record<string, keyof Player> = {
  'club': 'club',
  'city': 'city',
  'state': 'state',
  'group_label': 'group_label',
  'type_label': 'type_label',
};

type TeamPlayer = TeamPrizePlayer;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check: ?ping=1 (before reading body)
  if (hasPingQueryParam(req)) {
    console.log(`[${FUNCTION_NAME}] ping via query param`);
    return pingResponse(FUNCTION_NAME, BUILD_VERSION);
  }

  // Read body as text for safe ping detection
  const rawBody = await req.text();
  if (isPingBody(rawBody)) {
    console.log(`[${FUNCTION_NAME}] ping via body`);
    return pingResponse(FUNCTION_NAME, BUILD_VERSION);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse from already-read rawBody
    const body = JSON.parse(rawBody);
    let tournamentId = body.tournament_id;
    const slug = body.slug;

    // If slug provided, look up tournament
    if (!tournamentId && slug) {
      const { data: pub, error: pubErr } = await supabase
        .from('publications')
        .select('tournament_id')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();

      if (pubErr || !pub) {
        return new Response(
          JSON.stringify({ error: 'Tournament not found or not published' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      tournamentId = pub.tournament_id;
    }

    if (!tournamentId) {
      return new Response(
        JSON.stringify({ error: 'tournament_id or slug is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Verify tournament is published
    const { data: tournament, error: tourErr } = await supabase
      .from('tournaments')
      .select('id, is_published')
      .eq('id', tournamentId)
      .maybeSingle();

    if (tourErr || !tournament) {
      return new Response(
        JSON.stringify({ error: 'Tournament not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tournament.is_published) {
      return new Response(
        JSON.stringify({ error: 'Tournament is not published' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[publicTeamPrizes] Loading for published tournament: ${tournamentId}`);

    // Load institution prize groups
    const { data: groups, error: groupsError } = await supabase
      .from('institution_prize_groups')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('is_active', true)
      .order('name');

    if (groupsError) throw new Error(`Failed to load groups: ${groupsError.message}`);

    const typedGroups = (groups || []) as InstitutionPrizeGroup[];

    if (typedGroups.length === 0) {
      return new Response(
        JSON.stringify({ groups: [], players_loaded: 0, max_rank: 0, hasTeamPrizes: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Load prizes
    const groupIds = typedGroups.map(g => g.id);
    const { data: prizes, error: prizesError } = await supabase
      .from('institution_prizes')
      .select('*')
      .in('group_id', groupIds)
      .eq('is_active', true)
      .order('place');

    if (prizesError) throw new Error(`Failed to load prizes: ${prizesError.message}`);

    const allPrizes = (prizes || []) as InstitutionPrize[];

    // Load players
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('id, name, rank, gender, state, city, club, group_label, type_label')
      .eq('tournament_id', tournamentId)
      .order('rank');

    if (playersError) throw new Error(`Failed to load players: ${playersError.message}`);

    const typedPlayers = (players || []) as Player[];
    const maxRank = typedPlayers.reduce((max, p) => Math.max(max, p.rank), 0);

    // Process each group
    const groupResponses: unknown[] = [];

    for (const group of typedGroups) {
      const groupPrizes = allPrizes.filter(p => p.group_id === group.id);
      const columnName = GROUP_BY_COLUMN_MAP[group.group_by];

      if (!columnName) {
        groupResponses.push({
          group_id: group.id,
          name: group.name,
          config: {
            group_by: group.group_by,
            team_size: group.team_size,
            female_slots: group.female_slots,
            male_slots: group.male_slots,
            scoring_mode: group.scoring_mode,
          },
          prizes: groupPrizes.map(p => ({
            id: p.id,
            place: p.place,
            cash_amount: p.cash_amount,
            has_trophy: p.has_trophy,
            has_medal: p.has_medal,
            is_active: true,
            winner_institution: null,
          })),
          eligible_institutions: 0,
          ineligible_institutions: 0,
          ineligible_reasons: [],
        });
        continue;
      }

      // Group players by institution
      const institutionMap = new Map<string, TeamPlayer[]>();

      for (const player of typedPlayers) {
        const instKey = player[columnName] as string | null;
        if (!instKey || instKey.trim() === '') continue;

        const key = instKey.trim();
        const points = getRankPoints(player.rank, maxRank);

        if (!institutionMap.has(key)) {
          institutionMap.set(key, []);
        }
        institutionMap.get(key)!.push({
          id: player.id,
          name: player.name,
          rank: player.rank,
          points,
          gender: player.gender,
        });
      }

      // Score institutions
      type ScoredInstitution = {
        key: string;
        label: string;
        total_points: number;
        rank_sum: number;
        best_individual_rank: number;
        players: { player_id: string; name: string; rank: number; points: number; gender: string | null }[];
      };
      
      const scoredInstitutions: ScoredInstitution[] = [];
      let ineligibleCount = 0;
      const ineligibleReasons: string[] = [];

      for (const [instKey, instPlayers] of institutionMap) {
        const result = buildTeam(instPlayers, group.team_size, group.female_slots, group.male_slots);

        if (!result) {
          ineligibleCount++;
          const femaleCount = instPlayers.filter(p => isFemale(p.gender)).length;
          if (group.female_slots > 0 && femaleCount < group.female_slots) {
            ineligibleReasons.push(`${instKey}: needs ${group.female_slots} females, has ${femaleCount}`);
          } else {
            ineligibleReasons.push(`${instKey}: needs ${group.team_size} players, has ${instPlayers.length}`);
          }
          continue;
        }

        const { team } = result;
        scoredInstitutions.push({
          key: instKey,
          label: instKey,
          total_points: team.reduce((s, p) => s + p.points, 0),
          rank_sum: team.reduce((s, p) => s + p.rank, 0),
          best_individual_rank: Math.min(...team.map(p => p.rank)),
          players: team.map(p => ({
            player_id: p.id,
            name: p.name,
            rank: p.rank,
            points: p.points,
            gender: p.gender,
          })),
        });
      }

      // Sort
      scoredInstitutions.sort(compareInstitutions);

      // Assign winners
      const prizesWithWinners = groupPrizes.map((prize, idx) => ({
        id: prize.id,
        place: prize.place,
        cash_amount: prize.cash_amount,
        has_trophy: prize.has_trophy,
        has_medal: prize.has_medal,
        is_active: true,
        winner_institution: scoredInstitutions[idx] || null,
      }));

      groupResponses.push({
        group_id: group.id,
        name: group.name,
        config: {
          group_by: group.group_by,
          team_size: group.team_size,
          female_slots: group.female_slots,
          male_slots: group.male_slots,
          scoring_mode: group.scoring_mode,
        },
        prizes: prizesWithWinners,
        eligible_institutions: scoredInstitutions.length,
        ineligible_institutions: ineligibleCount,
        ineligible_reasons: ineligibleReasons.slice(0, 10),
      });
    }

    return new Response(
      JSON.stringify({
        groups: groupResponses,
        players_loaded: typedPlayers.length,
        max_rank: maxRank,
        hasTeamPrizes: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[publicTeamPrizes] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
