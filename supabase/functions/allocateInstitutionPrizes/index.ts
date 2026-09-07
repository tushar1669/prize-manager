import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, hasPingQueryParam, isPingBody, pingResponse } from "../_shared/health.ts";
import {
  computeTeamScoresWithReasons,
  detectTieAtPrizeBoundary,
  type TeamExclusion,
  type TeamPrizePlayer,
  type TeamGroupByKey,
  type TeamWarning,
} from "../_shared/teamPrizes.ts";

const BUILD_VERSION = "2026-09-07T00:00:00Z-TC1.4b";
const FUNCTION_NAME = "allocateInstitutionPrizes";

const corsHeaders = CORS_HEADERS;

// Team prize scoring logic lives in _shared/teamPrizes.ts to prevent drift.

/**
 * Institution Prize Allocation - Phase 2 Module
 * 
 * This is a SEPARATE module from the main individual allocation function.
 * It handles team/institution prizes (Best School, Best Academy, etc.)
 * 
 * Key differences from individual prizes:
 * - Players can win BOTH individual and institution prizes (ignores multi_prize_policy)
 * - Groups players by institution field (school, club, city, state, etc.)
 * - Calculates team scores based on top-K players per institution
 * - Supports gender slot requirements as MINIMUMS (e.g. a team of 4 must include at
 *   least 2 girls; any board left over after the minimums is filled by rank)
 * 
 * SCORING RULES:
 * - Score per player is the raw `players.points` column, passed through unchanged
 * - Players are ordered by rank ascending, tie-broken by id
 * - Team total_points = sum of the selected players' points
 * - Tie-break: rank_sum (lower better), then best_individual_rank (lower better), then institution name
 *
 * `max_rank` is reported in the response but is NOT used in scoring. Two claims in an
 * earlier version of this header said otherwise; see ARCHITECTURE §1.2 (DD5).
 */

// Type definitions for institution prizes
interface InstitutionPrizeGroup {
  id: string;
  tournament_id: string;
  name: string;
  group_by: string;
  team_size: number;
  female_slots: number;
  male_slots: number;
  scoring_mode: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface InstitutionPrize {
  id: string;
  group_id: string;
  place: number;
  cash_amount: number;
  has_trophy: boolean;
  has_medal: boolean;
  is_active: boolean;
  created_at: string;
}

interface Player {
  id: string;
  name: string;
  rank: number;
  gender: string | null;
  club: string | null;
  team: string | null;
  points: number | null;
  tournament_id: string;
  city: string | null;
  state: string | null;
  group_label: string | null;
  type_label: string | null;
}

// Response types
interface GroupConfig {
  group_by: string;
  team_size: number;
  female_slots: number;
  male_slots: number;
  scoring_mode: string;
}

interface TeamPlayerInfo {
  player_id: string;
  name: string;
  rank: number;
  points: number;
  gender: string | null;
}

interface WinnerInstitution {
  key: string;          // raw group_by value
  label: string;        // formatted label (institution name)
  total_points: number;
  rank_sum: number;
  best_individual_rank: number;
  players: TeamPlayerInfo[];
  tied_at_boundary?: boolean;
  /**
   * ARCHITECTURE §4 warn codes raised by the scorer for this institution. Present
   * only when the scorer produced any, so a group with no gender slots configured
   * serialises exactly as it did before TC1.4b.
   */
  warnings?: TeamWarning[];
}

/**
 * One excluded institution, structured. `ineligible_reasons` is the string rendering
 * TeamPrizeResultsPanel consumes today; this is the same information uncapped and
 * machine-readable, for TC1.5 to render properly.
 */
interface IneligibleDetail {
  key: string;
  reason: TeamExclusion['reason'];
  playerCount: number;
}

interface PrizeWithWinner {
  id: string;
  place: number;
  cash_amount: number;
  has_trophy: boolean;
  has_medal: boolean;
  is_active: boolean;
  winner_institution: WinnerInstitution | null;
}

interface GroupResponse {
  group_id: string;
  name: string;
  config: GroupConfig;
  prizes: PrizeWithWinner[];
  eligible_institutions: number;
  ineligible_institutions: number;
  ineligible_reasons: string[];
  ineligible_details: IneligibleDetail[];
  /**
   * Players discarded before grouping because this group's `group_by` column was
   * null, empty or whitespace-only. A player-level diagnostic, not an institution
   * exclusion — see ARCHITECTURE §4.
   */
  players_without_group_field: number;
  scored_institutions?: WinnerInstitution[];
}

interface AllocateInstitutionPrizesResponse {
  groups: GroupResponse[];
  players_loaded: number;
  max_rank: number;
}

interface AllocateInstitutionPrizesRequest {
  tournament_id: string;
}

/**
 * ARCHITECTURE §4 "Rendering rule". Codes are an internal vocabulary; the organizer
 * only ever sees a plain sentence. Obeys RULING 2 — each sentence states the RULE
 * that was not met and never asserts anything about a player's attributes.
 *
 * The institution key is prefixed so the organizer knows which school a line is about.
 * `ineligible_reasons` stays `string[]` because TeamPrizeResultsPanel renders it as
 * strings today; the structured form travels alongside it in `ineligible_details`.
 */
const EXCLUSION_SENTENCES: Record<TeamExclusion['reason'], string> = {
  team_short_roster: 'Fewer players than the team size.',
  female_slots_unfilled:
    'The rule asks for a minimum number of girls and the entry list does not meet it.',
  male_slots_unfilled:
    'The rule asks for other players and the entry list does not meet it.',
};

function formatExclusion(exclusion: TeamExclusion): string {
  return `${exclusion.key}: ${EXCLUSION_SENTENCES[exclusion.reason]}`;
}

// All supported group_by keys (must match _shared/teamPrizes.ts TeamGroupByKey)
const VALID_GROUP_BY_KEYS: Set<TeamGroupByKey> = new Set([
  'team', 'club', 'city', 'state', 'group_label', 'type_label',
]);

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
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
    const body: AllocateInstitutionPrizesRequest = JSON.parse(rawBody);
    const { tournament_id } = body;

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tournament_id) {
      return new Response(
        JSON.stringify({ error: 'tournament_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: tournamentAccess, error: tournamentAccessError } = await supabase
      .from('tournaments')
      .select('id, owner_id')
      .eq('id', tournament_id)
      .maybeSingle();

    if (tournamentAccessError) {
      throw new Error(`Failed to load tournament access: ${tournamentAccessError.message}`);
    }

    if (!tournamentAccess) {
      return new Response(
        JSON.stringify({ error: 'Tournament not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: isMaster, error: roleError } = await supabase
      .rpc('has_role', { _user_id: user.id, _role: 'master' });

    if (roleError) {
      throw new Error(`Failed to check user role: ${roleError.message}`);
    }

    if (tournamentAccess.owner_id !== user.id && !isMaster) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[allocateInstitutionPrizes] Loading data for tournament: ${tournament_id}`);

    // Load institution prize groups for this tournament
    const { data: groups, error: groupsError } = await supabase
      .from('institution_prize_groups')
      .select('*')
      .eq('tournament_id', tournament_id)
      .eq('is_active', true)
      .order('name');

    if (groupsError) {
      console.error('[allocateInstitutionPrizes] Error loading groups:', groupsError);
      throw new Error(`Failed to load institution prize groups: ${groupsError.message}`);
    }

    const typedGroups = (groups || []) as InstitutionPrizeGroup[];
    console.log(`[allocateInstitutionPrizes] Loaded ${typedGroups.length} active groups`);

    // Load prizes for all groups
    const groupIds = typedGroups.map(g => g.id);
    let allPrizes: InstitutionPrize[] = [];

    if (groupIds.length > 0) {
      const { data: prizes, error: prizesError } = await supabase
        .from('institution_prizes')
        .select('*')
        .in('group_id', groupIds)
        .eq('is_active', true)
        .order('place');

      if (prizesError) {
        console.error('[allocateInstitutionPrizes] Error loading prizes:', prizesError);
        throw new Error(`Failed to load institution prizes: ${prizesError.message}`);
      }

      allPrizes = (prizes || []) as InstitutionPrize[];
    }

    console.log(`[allocateInstitutionPrizes] Loaded ${allPrizes.length} active prizes`);

    // Load players for this tournament (all groupable columns)
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('id, name, rank, gender, club, team, city, state, group_label, type_label, points, tournament_id')
      .eq('tournament_id', tournament_id)
      .order('rank');

    if (playersError) {
      console.error('[allocateInstitutionPrizes] Error loading players:', playersError);
      throw new Error(`Failed to load players: ${playersError.message}`);
    }

    const typedPlayers = (players || []) as Player[];
    console.log(`[allocateInstitutionPrizes] Loaded ${typedPlayers.length} players`);

    // Calculate max rank for scoring
    const maxRank = typedPlayers.reduce((max, p) => Math.max(max, p.rank), 0);
    console.log(`[allocateInstitutionPrizes] Max rank: ${maxRank}`);

    // Process each group
    const groupResponses: GroupResponse[] = [];

    for (const group of typedGroups) {
      const groupPrizes = allPrizes.filter(p => p.group_id === group.id);
      
      // Determine which column to group by
      const columnName = group.group_by as TeamGroupByKey;
      if (!VALID_GROUP_BY_KEYS.has(columnName)) {
        console.warn(`[allocateInstitutionPrizes] Unknown group_by: ${group.group_by}, skipping group ${group.name}`);
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
            is_active: p.is_active,
            winner_institution: null,
          })),
          eligible_institutions: 0,
          ineligible_institutions: 0,
          ineligible_reasons: [`Invalid group_by value: ${group.group_by}`],
          ineligible_details: [],
          players_without_group_field: 0,
        });
        continue;
      }

      const teamPlayers: TeamPrizePlayer[] = typedPlayers.map((player) => ({
        id: String(player.id),
        name: String(player.name ?? ''),
        rank: Number(player.rank ?? 0),
        points: Number(player.points ?? 0),
        gender: (player.gender as string | null) ?? null,
        team: (player.team as string | null) ?? null,
        club: (player.club as string | null) ?? null,
        city: (player.city as string | null) ?? null,
        state: (player.state as string | null) ?? null,
        group_label: (player.group_label as string | null) ?? null,
        type_label: (player.type_label as string | null) ?? null,
      }));

      // TC1.4b: the group's configured gender minimums now reach the scorer. Both are
      // zero on every live group today, which is byte-identical to the rank-only path.
      const { scored: scoredInstitutions, excluded, droppedPlayersWithoutKey } =
        computeTeamScoresWithReasons(teamPlayers, group.team_size, columnName, {
          femaleSlots: group.female_slots,
          maleSlots: group.male_slots,
        });

      const ineligibleCount = excluded.length;

      // The sentence list is capped at 10, so WHICH ten matters. Ordered by player
      // count descending: a school that entered 9 of the 10 needed is a near-miss the
      // organizer may want to act on, a school that entered 1 is noise. No filter and
      // no threshold — `ineligible_institutions` remains the full `excluded.length`,
      // and `ineligible_details` below stays uncapped in the scorer's key order.
      // Array.prototype.sort is stable, so equal counts keep that key order.
      const ineligibleReasons: string[] = [...excluded]
        .sort((a, b) => b.playerCount - a.playerCount)
        .map(formatExclusion);

      const ineligibleDetails: IneligibleDetail[] = excluded.map((e) => ({
        key: e.key,
        reason: e.reason,
        playerCount: e.playerCount,
      }));

      const boundaryTies = detectTieAtPrizeBoundary(scoredInstitutions, groupPrizes.length);
      console.log(`[allocateInstitutionPrizes] Group "${group.name}": ${scoredInstitutions.length} eligible, ${ineligibleCount} ineligible, ${droppedPlayersWithoutKey} players without a ${columnName} value`);

      // Assign prizes
      const prizesWithWinners: PrizeWithWinner[] = groupPrizes.map((prize, index) => {
        // Prizes are already sorted by place
        const placeIndex = prize.place - 1;
        const winner = scoredInstitutions[placeIndex];

        return {
          id: prize.id,
          place: prize.place,
          cash_amount: prize.cash_amount,
          has_trophy: prize.has_trophy,
          has_medal: prize.has_medal,
          is_active: prize.is_active,
          winner_institution: winner ? {
            key: winner.key,
            label: winner.key, // Use key as label (could be enhanced with lookup)
            total_points: winner.total_points,
            rank_sum: winner.rank_sum,
            best_individual_rank: winner.best_individual_rank,
            players: winner.team.map((p) => ({ player_id: p.id, name: p.name, rank: p.rank, points: p.points, gender: p.gender })),
            tied_at_boundary: boundaryTies.includes(winner.key),
            ...(winner.warnings ? { warnings: winner.warnings } : {}),
          } : null,
        };
      });

      // Build scored_institutions for client-side tie detection
      // Include enough to cover all prizes + runner-up for boundary detection
      const maxPrizePlace = groupPrizes.reduce((max, p) => Math.max(max, p.place), 0);
      const scoredLimit = Math.min(maxPrizePlace + 2, scoredInstitutions.length);
      const scoredForResponse: WinnerInstitution[] = scoredInstitutions.slice(0, scoredLimit).map((inst) => ({
        key: inst.key,
        label: inst.key,
        total_points: inst.total_points,
        rank_sum: inst.rank_sum,
        best_individual_rank: inst.best_individual_rank,
        players: inst.team.map((p) => ({ player_id: p.id, name: p.name, rank: p.rank, points: p.points, gender: p.gender })),
        ...(inst.warnings ? { warnings: inst.warnings } : {}),
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
        ineligible_details: ineligibleDetails,
        players_without_group_field: droppedPlayersWithoutKey,
        scored_institutions: scoredForResponse,
      });
    }

    const response: AllocateInstitutionPrizesResponse = {
      groups: groupResponses,
      players_loaded: typedPlayers.length,
      max_rank: maxRank,
    };

    console.log(`[allocateInstitutionPrizes] Returning ${groupResponses.length} groups with winners`);

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[allocateInstitutionPrizes] Error:', error);
    return new Response(
      JSON.stringify({ error: 'internal_server_error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
