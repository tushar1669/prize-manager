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
 * - Supports gender slot requirements (e.g., team of 5 must include 2 girls)
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
  dob: string | null;
  gender: string | null;
  state: string | null;
  city: string | null;
  club: string | null;
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

interface PrizeInfo {
  id: string;
  place: number;
  cash_amount: number;
  has_trophy: boolean;
  has_medal: boolean;
  is_active: boolean;
}

interface GroupResponse {
  group_id: string;
  name: string;
  config: GroupConfig;
  prizes: PrizeInfo[];
}

interface AllocateInstitutionPrizesResponse {
  groups: GroupResponse[];
  players_loaded: number;
}

interface AllocateInstitutionPrizesRequest {
  tournament_id: string;
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

    // Load players for this tournament (same source as main allocator)
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('id, name, rank, rating, dob, gender, state, city, club, tournament_id')
      .eq('tournament_id', tournament_id)
      .order('rank');

    if (playersError) {
      console.error('[allocateInstitutionPrizes] Error loading players:', playersError);
      throw new Error(`Failed to load players: ${playersError.message}`);
    }

    const typedPlayers = (players || []) as Player[];
    console.log(`[allocateInstitutionPrizes] Loaded ${typedPlayers.length} players`);

    // Build response structure
    const groupResponses: GroupResponse[] = typedGroups.map(group => {
      const groupPrizes = allPrizes.filter(p => p.group_id === group.id);

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
        prizes: groupPrizes.map(p => ({
          id: p.id,
          place: p.place,
          cash_amount: p.cash_amount,
          has_trophy: p.has_trophy,
          has_medal: p.has_medal,
          is_active: p.is_active,
        })),
      };
    });

    const response: AllocateInstitutionPrizesResponse = {
      groups: groupResponses,
      players_loaded: typedPlayers.length,
    };

    console.log(`[allocateInstitutionPrizes] Returning ${groupResponses.length} groups`);

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
