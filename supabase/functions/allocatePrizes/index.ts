import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AllocatePrizesRequest {
  tournamentId: string;
  overrides?: Array<{ prizeId: string; playerId: string }>;
  ruleConfigOverride?: any;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload: AllocatePrizesRequest = await req.json();
    const { tournamentId, overrides = [], ruleConfigOverride } = payload;

    console.log(`[allocatePrizes] Starting allocation for tournament ${tournamentId}`);

    // 1) Fetch tournament data
    const { data: tournament, error: tournamentError } = await supabaseClient
      .from('tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();

    if (tournamentError) throw new Error(`Tournament not found: ${tournamentError.message}`);

    // 2) Fetch categories with prizes
    const { data: categories, error: categoriesError } = await supabaseClient
      .from('categories')
      .select(`
        *,
        prizes (*)
      `)
      .eq('tournament_id', tournamentId)
      .order('order_idx', { ascending: true });

    if (categoriesError) throw new Error(`Failed to fetch categories: ${categoriesError.message}`);

    // 3) Fetch players
    const { data: players, error: playersError } = await supabaseClient
      .from('players')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('rank', { ascending: true });

    if (playersError) throw new Error(`Failed to fetch players: ${playersError.message}`);

    // 4) Fetch rule config
    const { data: ruleConfig, error: ruleConfigError } = await supabaseClient
      .from('rule_config')
      .select('*')
      .eq('tournament_id', tournamentId)
      .maybeSingle();

    const rules = ruleConfigOverride || ruleConfig || {
      strict_age: true,
      allow_unrated_in_rating: false,
      prefer_category_rank_on_tie: false,
      prefer_main_on_equal_value: true,
      category_priority_order: ['main', 'others']
    };

    // 5) Build eligibility sets per category
    const eligibilityMap = new Map();
    for (const category of categories) {
      const eligiblePlayers = players.filter(player => 
        isEligibleForCategory(player, category, rules)
      );
      eligibilityMap.set(category.id, eligiblePlayers);
    }

    // 6) Build prize queue (sorted by priority)
    const prizeQueue = [];
    for (const category of categories) {
      for (const prize of (category.prizes || [])) {
        prizeQueue.push({
          ...prize,
          category,
          priority: calculatePrizePriority(prize, category, rules)
        });
      }
    }
    prizeQueue.sort((a, b) => b.priority - a.priority);

    // 7) Greedy allocation
    const winners = [];
    const assignedPlayers = new Set();
    const conflicts = [];

    for (const override of overrides) {
      assignedPlayers.add(override.playerId);
      winners.push({
        prizeId: override.prizeId,
        playerId: override.playerId,
        reasons: ['manual_override'],
        isManual: true
      });
    }

    for (const prizeItem of prizeQueue) {
      if (overrides.find(o => o.prizeId === prizeItem.id)) continue;

      const eligible = eligibilityMap.get(prizeItem.category.id) || [];
      const availablePlayers = eligible
        .filter(p => !assignedPlayers.has(p.id))
        .sort((a, b) => a.rank - b.rank);

      if (availablePlayers.length === 0) {
        conflicts.push({
          type: 'insufficient',
          impacted_prizes: [prizeItem.id],
          impacted_players: [],
          reasons: ['no_eligible_players_remaining'],
          suggested: null
        });
        continue;
      }

      const winner = availablePlayers[0];
      assignedPlayers.add(winner.id);
      winners.push({
        prizeId: prizeItem.id,
        playerId: winner.id,
        reasons: ['category_priority', 'rank_based'],
        isManual: false
      });
    }

    // 8) Enhanced conflict detection
    const allPrizes = categories.flatMap(c => c.prizes || []);
    const prizeById = new Map(allPrizes.map((p: any) => [p.id, p]));
    const categoryByPrizeId = new Map(
      (categories || []).flatMap((c: any) => (c.prizes || []).map((p: any) => [p.id, c]))
    );

    // Track what each player could win (by prizeId)
    const eligiblePrizeIdsByPlayer = new Map<string, string[]>();
    for (const prize of allPrizes as any[]) {
      // Get the category for this prize (built above)
      const cat = categoryByPrizeId.get(prize.id);
      if (!cat) continue;

      const eligible =
        (eligibilityMap as any).get(cat.id) || []; // eligibilityMap is keyed by category.id
      for (const player of eligible) {
        if (!eligiblePrizeIdsByPlayer.has(player.id)) {
          eligiblePrizeIdsByPlayer.set(player.id, []);
        }
        eligiblePrizeIdsByPlayer.get(player.id)!.push(prize.id);
      }
    }

    // A) Multi-eligibility
    eligiblePrizeIdsByPlayer.forEach((prizeIds, playerId) => {
      const unique = Array.from(new Set(prizeIds));
      if (unique.length > 1) {
        const currentWin = winners.find(w => w.playerId === playerId && unique.includes(w.prizeId));
        const suggestedPrizeId =
          currentWin?.prizeId ??
          unique
            .map(id => prizeById.get(id))
            .filter(Boolean)
            .sort((a: any, b: any) => (Number(b.cash_amount) || 0) - (Number(a.cash_amount) || 0))[0]?.id;

        conflicts.push({
          id: crypto.randomUUID(),
          type: 'multi-eligibility',
          impacted_players: [playerId],
          impacted_prizes: unique,
          reasons: ['Player eligible for multiple prizes'],
          suggested: suggestedPrizeId ? { prizeId: suggestedPrizeId, playerId } : null,
          tournament_id: tournamentId,
        });
      }
    });

    // B) Equal-value clusters among UNASSIGNED prizes
    const unassignedPrizes = allPrizes.filter((p: any) => !winners.some(w => w.prizeId === p.id));
    const prizesByValue = new Map<number, any[]>();
    unassignedPrizes.forEach((p: any) => {
      const val = Number(p.cash_amount) || 0;
      if (!prizesByValue.has(val)) prizesByValue.set(val, []);
      prizesByValue.get(val)!.push(p);
    });

    prizesByValue.forEach((prizes, value) => {
      if (value <= 0 || prizes.length < 2) return;

      // playerId -> prizeIds (within this equal-value cluster)
      const candidates = new Map<string, string[]>();
      for (const prize of prizes as any[]) {
        const cat = categoryByPrizeId.get(prize.id);
        if (!cat) continue;

        const eligible =
          (eligibilityMap as any).get(cat.id) || []; // eligibilityMap is keyed by category.id
        for (const player of eligible) {
          if (!candidates.has(player.id)) candidates.set(player.id, []);
          candidates.get(player.id)!.push(prize.id);
        }
      }

      candidates.forEach((ids, pid) => {
        const unique = Array.from(new Set(ids));
        if (unique.length > 1) {
          const currentWin = winners.find(w => w.playerId === pid && unique.includes(w.prizeId));
          conflicts.push({
            id: crypto.randomUUID(),
            type: 'equal-value',
            impacted_players: [pid],
            impacted_prizes: unique,
            reasons: [`Multiple equal-value prizes (₹${value}) eligible`],
            suggested: currentWin ? { prizeId: currentWin.prizeId, playerId: pid } : null,
            tournament_id: tournamentId,
          });
        }
      });
    });

    // C) Rule-exclusion (strict_age)
    if (rules?.strict_age) {
      const playersById = new Map((players || []).map((p: any) => [p.id, p]));
      const calcAge = (dob: string) => {
        const d = new Date(dob);
        if (isNaN(d.getTime())) return null;
        const today = new Date();
        let age = today.getFullYear() - d.getFullYear();
        const m = today.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
        return age;
      };

      winners.forEach(w => {
        const prize = prizeById.get(w.prizeId);
        const cat = prize ? categoryByPrizeId.get(prize.id) : null;
        const player = playersById.get(w.playerId);
        const range = cat?.criteria_json?.age_range as [number, number] | undefined;

        if (player?.dob && Array.isArray(range) && range.length === 2) {
          const age = calcAge(player.dob);
          if (age !== null && (age < range[0] || age > range[1])) {
            conflicts.push({
              id: crypto.randomUUID(),
              type: 'rule-exclusion',
              impacted_players: [w.playerId],
              impacted_prizes: [w.prizeId],
              reasons: ['Strict age violation'],
              suggested: null,
              tournament_id: tournamentId,
            });
          }
        }
      });
    }

    console.log(`[allocatePrizes] Completed: ${winners.length} winners, ${conflicts.length} conflicts`);

    return new Response(
      JSON.stringify({ winners, conflicts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[allocatePrizes] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper functions
function isEligibleForCategory(player: any, category: any, rules: any): boolean {
  const criteria = category.criteria_json || {};
  
  // Age check
  if (criteria.age_max && player.dob) {
    const age = calculateAge(player.dob);
    if (age > criteria.age_max && rules.strict_age) return false;
  }

  // Gender check
  if (criteria.gender && player.gender !== criteria.gender) return false;

  // Rating check
  if (criteria.rating_min && player.rating < criteria.rating_min) return false;
  if (criteria.rating_max && player.rating > criteria.rating_max) return false;

  // Unrated check
  if (!player.rating && !rules.allow_unrated_in_rating && (criteria.rating_min || criteria.rating_max)) {
    return false;
  }

  return true;
}

function calculateAge(dob: string): number {
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function calculatePrizePriority(prize: any, category: any, rules: any): number {
  let priority = 0;
  
  // Main category gets highest priority
  if (category.is_main) priority += 1000;
  
  // Cash value
  priority += parseFloat(prize.cash_amount || 0);
  
  // Place (lower is better)
  priority -= prize.place * 0.1;
  
  return priority;
}
