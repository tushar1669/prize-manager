import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, hasPingQueryParam, isPingBody, pingResponse } from "../_shared/health.ts";
import {
  computeTeamScoresWithReasons,
  type TeamExclusion,
  type TeamPrizePlayer,
  type TeamGroupByKey,
  type TeamWarning,
} from "../_shared/teamPrizes.ts";
import {
  rankTeamCandidatesV2, parseTeamRankingRuleConfig, defaultTeamRankingRuleConfig, importedTieBreakContextFromTags,
} from "../_shared/teamRankingV2.ts";
import { buildTeamRankingAwardAudit } from "../_shared/teamRankingAudit.ts";

// Deploy evidence under Y3: `?ping=1` returns this string, and the dashboard's own
// version number is not evidence of a deploy. It must therefore change whenever this
// file's behaviour changes — a constant that survives an amendment proves nothing.
// TC1.5 added `players_without_points` to the response, so it changes here.
const BUILD_VERSION = "2026-11-02-team-ties-usual-dialog";
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
 * - Teams rank by total points, then the group's saved tie-break steps
 * - Places the steps cannot decide stay empty and are listed in `ranking_ties`;
 *   the organizer chooses the order in the usual tie dialog on Finalize
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
  ranking_rules?: unknown;
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
  tags_json?: unknown;
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
  ranking_snapshot?: NonNullable<ReturnType<typeof buildTeamRankingAwardAudit>>;
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
  /**
   * Players in the SELECTED pool — those actually placed into a scored team — whose
   * `points` column is null or not finite. The scorer coerces such a player to 0, so
   * a team with no points at all totals 0, a number indistinguishable from a team
   * that scored nothing. This count lets the display say "—" and name the cause
   * instead of inferring an absence from a row of zeros.
   *
   * Every scored institution contributes exactly `team_size` players, so the pool
   * size is `eligible_institutions * team_size` and a consumer can test equality.
   */
  players_without_points: number;
  scored_institutions?: WinnerInstitution[];
  /** Places that could not be decided for the whole group (e.g. missing points). */
  ranking_issues?: string[];
  /**
   * Places the tie-break steps could not decide. Each lists the teams in
   * contention; the organizer orders them in the usual tie dialog.
   */
  ranking_ties?: Array<{ affected_places: number[]; reason: string; teams: WinnerInstitution[] }>;
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

/** Plain-language reason a place could not be decided automatically. */
const RANKING_HOLD_SENTENCES: Record<string, string> = {
  missing_tb: 'a counted player has a blank tie-break value in the imported Excel',
  no_imported_tbs: 'the imported Excel has no usable tie-break columns (or no Excel is imported yet)',
  mixed_tb_sources: 'players come from different Excel imports; import the full file again',
  missing_rank: 'a counted player has no rank',
  missing_points: 'a counted player has no points',
  undefined_tb: 'an older tie-break step has no name; remove it in Edit Rules',
  invalid_team_size: 'teams have different numbers of counted players',
};

/** Holds that concern every team in the group; the tie dialog cannot settle them. */
const GROUP_WIDE_HOLDS = new Set(['missing_points', 'invalid_team_size']);

function holdReason(status: string, reason: string | undefined): string {
  if (status === 'tied') return 'still equal after every tie-break step';
  return (reason && RANKING_HOLD_SENTENCES[reason]) ?? 'the tie-break steps could not be applied';
}

function formatExclusion(exclusion: TeamExclusion): string {
  return `${exclusion.key}: ${EXCLUSION_SENTENCES[exclusion.reason]}`;
}

/** Reads only the reserved, typed individual TB namespace; never uses
 * unrelated tags, event-rule names inferred from TB ordinals, or missing zeros.
 */
function parsePlayerTbs(tags: unknown): { sourceHash: string | null; values: Record<number, number | null> } | null {
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return null;
  const raw = (tags as Record<string, unknown>).team_tiebreak_v2;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1 || !obj.values || typeof obj.values !== 'object' || Array.isArray(obj.values)) return null;
  const values: Record<number, number | null> = {};
  for (const [key, value] of Object.entries(obj.values)) {
    const ordinal = Number(key);
    if (!Number.isSafeInteger(ordinal) || ordinal < 1 || key !== String(ordinal)) return null;
    values[ordinal] = typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  return { sourceHash: typeof obj.source_hash === 'string' ? obj.source_hash : null, values };
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
      .select('id, name, rank, gender, club, team, city, state, group_label, type_label, points, tags_json, tournament_id')
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

    // "Imported individual tie-breaks" reads the CURRENT import's columns
    // here, once, so organizers can choose the step before importing.
    const importedTieBreaks = importedTieBreakContextFromTags(typedPlayers.map(player => player.tags_json));

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
          players_without_points: 0,
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

      // Counted over the selected pool only — the players whose points are summed —
      // because that is the pool the "—" display speaks for. Read from the raw rows,
      // not from `teamPlayers`, where `points ?? 0` has already erased the null.
      const rawPointsById = new Map(typedPlayers.map((p) => [String(p.id), p.points]));
      let playersWithoutPoints = 0;
      for (const institution of scoredInstitutions) {
        for (const player of institution.team) {
          const raw = rawPointsById.get(player.id);
          if (raw === null || raw === undefined || !Number.isFinite(Number(raw))) {
            playersWithoutPoints += 1;
          }
        }
      }

      // Keep the rank-first / gender-slot PLAYER SELECTION, then rank the
      // selected teams by total points and the group's tie-break steps.
      const rawPlayerById = new Map(typedPlayers.map(p => [String(p.id), p]));
      const config = parseTeamRankingRuleConfig(group.ranking_rules) ?? defaultTeamRankingRuleConfig();
      const selectedCandidates = scoredInstitutions.map(institution => ({
        key: institution.key,
        selectedPlayers: institution.team.map(selected => {
          const raw = rawPlayerById.get(selected.id);
          const sourceTbs = parsePlayerTbs(raw?.tags_json);
          return {
            playerId: selected.id,
            points: typeof raw?.points === 'number' && Number.isFinite(raw.points) ? raw.points : null,
            // Needed by the optional "Best individual rank" step. Absent is not a rank.
            rank: typeof raw?.rank === 'number' && Number.isFinite(raw.rank) ? raw.rank : null,
            sourceHash: sourceTbs?.sourceHash ?? null,
            individualTieBreaks: sourceTbs?.values ?? {},
          };
        }),
      }));
      const partitions = rankTeamCandidatesV2(selectedCandidates, config, importedTieBreaks);
      const scoredByKey = new Map(scoredInstitutions.map(institution => [institution.key, institution]));
      const rankedSlots = partitions.flatMap(partition =>
        partition.teams.map(team => ({ partition, institution: scoredByKey.get(team.key) })),
      );
      // Places the steps could not decide stay empty. A tie among teams goes
      // to the organizer's tie dialog; a hold affecting the whole group (no
      // points, uneven teams) is reported as an issue instead.
      const asInstitution = (institution: (typeof scoredInstitutions)[number]): WinnerInstitution => ({
        key: institution.key,
        label: institution.key,
        total_points: institution.total_points,
        rank_sum: institution.rank_sum,
        best_individual_rank: institution.best_individual_rank,
        players: institution.team.map((p) => ({ player_id: p.id, name: p.name, rank: p.rank, points: p.points, gender: p.gender })),
      });
      const rankingTies: NonNullable<GroupResponse['ranking_ties']> = [];
      const rankingIssues: string[] = [];
      let precedingTeams = 0;
      for (const partition of partitions) {
        const start = precedingTeams;
        precedingTeams += partition.teams.length;
        if (partition.status === 'resolved') continue;
        const affectedPlaces = groupPrizes
          .filter(prize => prize.place > start && prize.place <= precedingTeams)
          .map(prize => prize.place).sort((a, b) => a - b);
        if (!affectedPlaces.length) continue;
        const reason = holdReason(partition.status, partition.reason);
        if (partition.status === 'blocked' && partition.reason && GROUP_WIDE_HOLDS.has(partition.reason)) {
          rankingIssues.push(`Places ${affectedPlaces.join(', ')} could not be decided: ${reason}.`);
          continue;
        }
        rankingTies.push({
          affected_places: affectedPlaces,
          reason,
          teams: partition.teams.flatMap(team => {
            const institution = scoredByKey.get(team.key);
            return institution ? [asInstitution(institution)] : [];
          }),
        });
      }
      console.log(`[allocateInstitutionPrizes] Group result: ${scoredInstitutions.length} eligible, ${ineligibleCount} ineligible, ${rankingTies.length} ties, ${rankingIssues.length} ranking issues`);

      // Assign prizes. Only a decided place gets a winner.
      const prizesWithWinners: PrizeWithWinner[] = groupPrizes.map((prize) => {
        const slot = rankedSlots[prize.place - 1];
        const winner = slot?.partition.status === 'resolved' ? slot.institution : null;

        return {
          id: prize.id,
          place: prize.place,
          cash_amount: prize.cash_amount,
          has_trophy: prize.has_trophy,
          has_medal: prize.has_medal,
          is_active: prize.is_active,
          winner_institution: winner ? {
            ...asInstitution(winner),
            ranking_snapshot: buildTeamRankingAwardAudit(
              group.id,
              { group_by: group.group_by, team_size: group.team_size, female_slots: group.female_slots,
                male_slots: group.male_slots, scoring_mode: group.scoring_mode },
              { id: prize.id, place: prize.place, cash_amount: prize.cash_amount,
                has_trophy: prize.has_trophy, has_medal: prize.has_medal },
              winner.key, config, selectedCandidates, partitions, importedTieBreaks,
            ) ?? undefined,
            ...(winner.warnings ? { warnings: winner.warnings } : {}),
          } : null,
        };
      });

      // Teams in ranked order, enough to cover all prizes plus the runner-up.
      const maxPrizePlace = groupPrizes.reduce((max, p) => Math.max(max, p.place), 0);
      const orderedInstitutions = rankedSlots.map(({ institution }) => institution);
      const scoredLimit = Math.min(maxPrizePlace + 2, orderedInstitutions.length);
      const scoredForResponse: WinnerInstitution[] = orderedInstitutions.slice(0, scoredLimit).flatMap((inst) => inst ? [{
        ...asInstitution(inst),
        ...(inst.warnings ? { warnings: inst.warnings } : {}),
      }] : []);

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
        players_without_points: playersWithoutPoints,
        ranking_issues: rankingIssues,
        ranking_ties: rankingTies,
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
