import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

/**
 * Institution Prize Allocation - Phase 2 Module
 * 
 * This is a SEPARATE module from the main allocatePrizes function.
 * It handles team/institution prizes (Best School, Best Academy, etc.)
 * 
 * Key differences from individual prizes:
 * - Players can win BOTH individual and institution prizes (ignores multi_prize_policy)
 * - Groups players by institution field (school, club, city, state, etc.)
 * - Calculates team scores based on top-K players per institution
 * - Supports gender slot requirements (e.g., team of 4 must include 2 girls + 2 boys)
 * 
 * SCORING RULES:
 * - Uses "rank points" as score: (max_rank + 1 - player_rank)
 * - Lower rank = higher score (rank 1 gets highest score)
 * - Team total_points = sum of team members' rank points
 * - Tie-break: rank_sum (lower better), then best_individual_rank (lower better), then institution name
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
  rating: number | null;
  gender: string | null;
  state: string | null;
  city: string | null;
  club: string | null;
  group_label: string | null;
  type_label: string | null;
  tournament_id: string;
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
}

interface AllocateInstitutionPrizesResponse {
  groups: GroupResponse[];
  players_loaded: number;
  max_rank: number;
}

interface AllocateInstitutionPrizesRequest {
  tournament_id: string;
}

// Map group_by codes to player columns
const GROUP_BY_COLUMN_MAP: Record<string, keyof Player> = {
  'club': 'club',
  'city': 'city',
  'state': 'state',
  'group_label': 'group_label',
  'type_label': 'type_label',
};

/**
 * Check if a player is female (gender = 'F')
 */
function isFemale(gender: string | null): boolean {
  return gender?.toUpperCase() === 'F';
}

/**
 * Check if a player is "not F" (male, unknown, null - consistent with main allocator's Boys (not F))
 */
function isNotF(gender: string | null): boolean {
  return !isFemale(gender);
}

/**
 * Get player's score based on rank (higher rank = lower score)
 * Score = (maxRank + 1) - rank
 * This ensures rank 1 gets the highest score
 */
function getRankPoints(rank: number, maxRank: number): number {
  return maxRank + 1 - rank;
}

/**
 * Compare players for sorting: by points DESC, then rank ASC (tie-break)
 */
function comparePlayersByScore(a: { rank: number; points: number }, b: { rank: number; points: number }): number {
  // Higher points first
  if (b.points !== a.points) {
    return b.points - a.points;
  }
  // Lower rank wins tie-break
  return a.rank - b.rank;
}

/**
 * Compare institutions for ranking
 */
function compareInstitutions(
  a: { total_points: number; rank_sum: number; best_individual_rank: number; key: string },
  b: { total_points: number; rank_sum: number; best_individual_rank: number; key: string }
): number {
  // Higher total_points first
  if (b.total_points !== a.total_points) {
    return b.total_points - a.total_points;
  }
  // Lower rank_sum wins tie-break
  if (a.rank_sum !== b.rank_sum) {
    return a.rank_sum - b.rank_sum;
  }
  // Lower best_individual_rank wins
  if (a.best_individual_rank !== b.best_individual_rank) {
    return a.best_individual_rank - b.best_individual_rank;
  }
  // Alphabetical by institution name
  return a.key.localeCompare(b.key);
}

/**
 * Build a team for an institution with gender slot requirements
 * Returns null if the institution cannot form a valid team
 */
function buildTeam(
  players: Array<{ id: string; name: string; rank: number; points: number; gender: string | null }>,
  teamSize: number,
  femaleSlots: number,
  maleSlots: number
): { team: TeamPlayerInfo[]; reason?: string } | null {
  // Separate by gender
  const females = players.filter(p => isFemale(p.gender));
  const notFs = players.filter(p => isNotF(p.gender));

  // Sort each pool by points (desc), then rank (asc)
  females.sort(comparePlayersByScore);
  notFs.sort(comparePlayersByScore);

  const team: TeamPlayerInfo[] = [];
  const usedIds = new Set<string>();

  // Step 1: Fill required female slots
  if (femaleSlots > 0) {
    if (females.length < femaleSlots) {
      return null; // Not enough female players
    }
    for (let i = 0; i < femaleSlots; i++) {
      const p = females[i];
      team.push({
        player_id: p.id,
        name: p.name,
        rank: p.rank,
        points: p.points,
        gender: p.gender,
      });
      usedIds.add(p.id);
    }
  }

  // Step 2: Fill required male slots
  if (maleSlots > 0) {
    if (notFs.length < maleSlots) {
      return null; // Not enough male/notF players
    }
    for (let i = 0; i < maleSlots; i++) {
      const p = notFs[i];
      team.push({
        player_id: p.id,
        name: p.name,
        rank: p.rank,
        points: p.points,
        gender: p.gender,
      });
      usedIds.add(p.id);
    }
  }

  // Step 3: Fill remaining slots with best available (any gender)
  const remainingSlots = teamSize - team.length;
  if (remainingSlots > 0) {
    // Combine remaining players from both pools
    const remaining = [
      ...females.filter(p => !usedIds.has(p.id)),
      ...notFs.filter(p => !usedIds.has(p.id)),
    ];
    remaining.sort(comparePlayersByScore);

    if (remaining.length < remainingSlots) {
      return null; // Not enough players total
    }

    for (let i = 0; i < remainingSlots; i++) {
      const p = remaining[i];
      team.push({
        player_id: p.id,
        name: p.name,
        rank: p.rank,
        points: p.points,
        gender: p.gender,
      });
      usedIds.add(p.id);
    }
  }

  return { team };
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body
    const body: AllocateInstitutionPrizesRequest = await req.json();
    const { tournament_id } = body;

    if (!tournament_id) {
      return new Response(
        JSON.stringify({ error: 'tournament_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Load players for this tournament (including group_label and type_label for grouping)
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('id, name, rank, rating, gender, state, city, club, group_label, type_label, tournament_id')
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
      const columnName = GROUP_BY_COLUMN_MAP[group.group_by];
      if (!columnName) {
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
        });
        continue;
      }

      // Group players by institution
      const institutionMap = new Map<string, Array<{
        id: string;
        name: string;
        rank: number;
        points: number;
        gender: string | null;
      }>>();

      for (const player of typedPlayers) {
        const institutionKey = player[columnName] as string | null;
        
        // Skip players with empty/null institution
        if (!institutionKey || institutionKey.trim() === '') {
          continue;
        }

        const trimmedKey = institutionKey.trim();
        const points = getRankPoints(player.rank, maxRank);

        if (!institutionMap.has(trimmedKey)) {
          institutionMap.set(trimmedKey, []);
        }
        institutionMap.get(trimmedKey)!.push({
          id: player.id,
          name: player.name,
          rank: player.rank,
          points,
          gender: player.gender,
        });
      }

      console.log(`[allocateInstitutionPrizes] Group "${group.name}": found ${institutionMap.size} institutions`);

      // Build teams and score institutions
      const scoredInstitutions: Array<{
        key: string;
        total_points: number;
        rank_sum: number;
        best_individual_rank: number;
        team: TeamPlayerInfo[];
      }> = [];
      const ineligibleReasons: string[] = [];
      let ineligibleCount = 0;

      for (const [instKey, instPlayers] of institutionMap) {
        const result = buildTeam(
          instPlayers,
          group.team_size,
          group.female_slots,
          group.male_slots
        );

        if (!result) {
          ineligibleCount++;
          // Determine reason
          const femaleCount = instPlayers.filter(p => isFemale(p.gender)).length;
          const notFCount = instPlayers.filter(p => isNotF(p.gender)).length;
          
          if (group.female_slots > 0 && femaleCount < group.female_slots) {
            ineligibleReasons.push(`${instKey}: needs ${group.female_slots} females, has ${femaleCount}`);
          } else if (group.male_slots > 0 && notFCount < group.male_slots) {
            ineligibleReasons.push(`${instKey}: needs ${group.male_slots} males, has ${notFCount}`);
          } else {
            ineligibleReasons.push(`${instKey}: needs ${group.team_size} players, has ${instPlayers.length}`);
          }
          continue;
        }

        const { team } = result;
        const total_points = team.reduce((sum, p) => sum + p.points, 0);
        const rank_sum = team.reduce((sum, p) => sum + p.rank, 0);
        const best_individual_rank = Math.min(...team.map(p => p.rank));

        scoredInstitutions.push({
          key: instKey,
          total_points,
          rank_sum,
          best_individual_rank,
          team,
        });
      }

      // Sort institutions by scoring criteria
      scoredInstitutions.sort(compareInstitutions);

      console.log(`[allocateInstitutionPrizes] Group "${group.name}": ${scoredInstitutions.length} eligible, ${ineligibleCount} ineligible`);

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
            players: winner.team,
          } : null,
        };
      });

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
        ineligible_reasons: ineligibleReasons.slice(0, 10), // Limit to first 10 reasons
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
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
