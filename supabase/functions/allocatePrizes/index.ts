import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://prize-manager.lovable.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

interface AllocatePrizesRequest {
  tournamentId: string;
  overrides?: Array<{ prizeId: string; playerId: string }>;
  ruleConfigOverride?: any;
}

type PrizeRow = {
  id: string;
  place: number;
  cash_amount: number | null;
  has_trophy: boolean;
  has_medal: boolean;
  is_active?: boolean;
};

type CategoryRow = {
  id: string;
  name: string;
  is_main: boolean;
  order_idx: number;
  is_active?: boolean;
  criteria_json?: any;
  prizes: PrizeRow[];
};

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

    // 1) Fetch tournament data with start_date
    const { data: tournament, error: tournamentError } = await supabaseClient
      .from('tournaments')
      .select('id, title, start_date, end_date')
      .eq('id', tournamentId)
      .maybeSingle();

    if (tournamentError || !tournament) throw new Error(`Tournament not found: ${tournamentError?.message}`);

    // Use tournament start_date for age calculation, fallback to today
    const tournamentStartDate = tournament.start_date ? new Date(tournament.start_date) : new Date();

    // 2) Fetch categories with prizes (order by order_idx for brochure order)
    const { data: categories, error: categoriesError } = await supabaseClient
      .from('categories')
      .select(`
        id, name, is_main, order_idx, is_active, criteria_json,
        prizes (id, place, cash_amount, has_trophy, has_medal, is_active)
      `)
      .eq('tournament_id', tournamentId)
      .order('order_idx', { ascending: true });

    if (categoriesError) throw new Error(`Failed to fetch categories: ${categoriesError.message}`);

    // Filter to active categories and prizes
    const activeCategories = (categories || [])
      .filter(c => c.is_active !== false)
      .map(c => ({
        ...c,
        prizes: (c.prizes || []).filter((p: any) => p.is_active !== false)
      })) as CategoryRow[];

    const activePrizes = activeCategories.flatMap(cat => cat.prizes || []);

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

    console.log('[alloc] tId', tournamentId, 'players', players?.length || 0, 'cats', activeCategories.length, 'prizes', activePrizes.length);

    // 5) Build prize queue sorted by brochure order
    const prizeQueue = activeCategories.flatMap(cat => 
      cat.prizes.map(p => ({ cat, p }))
    );

    prizeQueue.sort(cmpPrize);

    if (prizeQueue.length > 0) {
      console.log('[alloc] queue', prizeQueue.length, 'firstKey', prizeKey(prizeQueue[0].cat, prizeQueue[0].p));
    }

    // 6) Greedy allocation: rank-first, filtered prize queue
    const winners: Array<{
      prizeId: string;
      playerId: string;
      reasons: string[];
      isManual: boolean;
    }> = [];
    const assignedPlayers = new Set<string>();

    // Apply manual overrides first
    for (const override of overrides) {
      assignedPlayers.add(override.playerId);
      winners.push({
        prizeId: override.prizeId,
        playerId: override.playerId,
        reasons: ['manual_override'],
        isManual: true
      });
    }

    // Allocate prizes in brochure priority order
    for (const { cat, p } of prizeQueue) {
      // Skip if manually overridden
      if (overrides.find(o => o.prizeId === p.id)) continue;

      // Find eligible unassigned players
      const eligible = (players || [])
        .filter(player => 
          isEligible(player, cat, rules, tournamentStartDate) && 
          !assignedPlayers.has(player.id)
        )
        .sort((a: any, b: any) => a.rank - b.rank);

      if (eligible.length === 0) {
        // No eligible players left for this prize
        continue;
      }

      // Pick first (lowest rank)
      const winner = eligible[0];
      assignedPlayers.add(winner.id);
      winners.push({
        prizeId: p.id,
        playerId: winner.id,
        reasons: ['auto', 'rank', 'brochure_order', 'value_tier'],
        isManual: false
      });

      console.log('[alloc] win', { prizeId: p.id, cat: cat.name, place: p.place, player: winner.name, rank: winner.rank });
    }

    // 7) Minimal conflict detection: only for identical prizeKey ties
    const conflicts: Array<{
      id: string;
      type: string;
      impacted_players: string[];
      impacted_prizes: string[];
      reasons: string[];
      suggested: { prizeId: string; playerId: string } | null;
      tournament_id: string;
    }> = [];
    
    // Build eligibility map: player -> prizes they're eligible for
    const playerEligiblePrizes = new Map<string, Array<{ cat: CategoryRow; p: PrizeRow }>>();
    for (const { cat, p } of prizeQueue) {
      for (const player of players || []) {
        if (isEligible(player, cat, rules, tournamentStartDate)) {
          if (!playerEligiblePrizes.has(player.id)) {
            playerEligiblePrizes.set(player.id, []);
          }
          playerEligiblePrizes.get(player.id)!.push({ cat, p });
        }
      }
    }

    // Check for identical prizeKey conflicts (true ties)
    playerEligiblePrizes.forEach((eligibleList, playerId) => {
      if (eligibleList.length < 2) return;

      // Group by prizeKey
      const keyGroups = new Map<string, Array<{ cat: CategoryRow; p: PrizeRow }>>();
      for (const item of eligibleList) {
        const key = JSON.stringify(prizeKey(item.cat, item.p));
        if (!keyGroups.has(key)) {
          keyGroups.set(key, []);
        }
        keyGroups.get(key)!.push(item);
      }

      // If any group has 2+ prizes with identical keys, it's a true tie
      keyGroups.forEach((group, key) => {
        if (group.length > 1) {
          conflicts.push({
            id: crypto.randomUUID(),
            type: 'tie',
            impacted_players: [playerId],
            impacted_prizes: group.map(item => item.p.id),
            reasons: ['identical_prize_priority'],
            suggested: null,
            tournament_id: tournamentId,
          });
        }
      });
    });

    console.log('[alloc] done', { winners: winners.length, conflicts: conflicts.length });

    return new Response(
      JSON.stringify({ 
        winners, 
        conflicts,
        meta: {
          playerCount: players?.length || 0,
          activeCategoryCount: activeCategories.length,
          activePrizeCount: activePrizes.length,
          winnersCount: winners.length,
          conflictCount: conflicts.length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (e: any) {
    console.error('[allocatePrizes] fatal', e);
    return new Response(
      JSON.stringify({ error: String((e && e.message) || e) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

// ============= Helper Functions =============

const normGender = (g?: string | null): string | null => {
  if (!g) return null;
  const s = String(g).trim().toLowerCase();
  if (['m', 'male', 'boy', 'boys'].includes(s)) return 'M';
  if (['f', 'female', 'girl', 'girls'].includes(s)) return 'F';
  return null;
};

const yearsOn = (dobISO: string | null | undefined, onDate: Date): number | null => {
  if (!dobISO) return null;
  const d = new Date(dobISO);
  if (Number.isNaN(d.getTime())) return null;
  let y = onDate.getFullYear() - d.getFullYear();
  const m = onDate.getMonth() - d.getMonth();
  const day = onDate.getDate() - d.getDate();
  if (m < 0 || (m === 0 && day < 0)) y -= 1;
  return y;
};

// Detect rating category purely by presence of rating bounds
const isRatingCategory = (criteria: any): boolean =>
  criteria && (typeof criteria.min_rating === 'number' || typeof criteria.max_rating === 'number');

const isEligible = (player: any, cat: CategoryRow, rules: any, onDate: Date): boolean => {
  const c = cat.criteria_json || {};
  
  // Gender check
  const reqG = c.gender?.toUpperCase?.() || null; // 'M' | 'F' | 'OPEN' | undefined
  const pg = normGender(player.gender);
  if (reqG === 'M' && pg !== 'M') return false;
  if (reqG === 'F' && pg !== 'F') return false;
  // OPEN allows both (no check)

  // Age (strict ON by default)
  const strict = rules?.strict_age !== false;
  const age = yearsOn(player.dob ?? null, onDate);
  if (c.max_age != null && strict) {
    if (age == null || age > Number(c.max_age)) return false;  // U13 => age <= 13
  }
  if (c.min_age != null && strict) {
    if (age == null || age < Number(c.min_age)) return false;  // Veteran 40+ => age >= 40
  }

  // Rating category handling
  const ratingCat = isRatingCategory(c);
  const allowUnrated = !!rules?.allow_unrated_in_rating;
  const rating = (player.rating == null ? null : Number(player.rating));
  if (ratingCat) {
    if ((rating == null || rating === 0) && !allowUnrated) return false;
    if (c.min_rating != null && rating != null && rating < Number(c.min_rating)) return false;
    if (c.max_rating != null && rating != null && rating > Number(c.max_rating)) return false;
  }

  // Optional filters (disability/city/state/club lists)
  const inList = (val: any, arr?: any[]) => 
    !arr || arr.length === 0 || arr.map(x => String(x).toLowerCase()).includes(String(val ?? '').toLowerCase());
  
  if (Array.isArray(c.allowed_disabilities) && c.allowed_disabilities.length > 0) {
    if (!inList(player.disability, c.allowed_disabilities)) return false;
  }
  if (Array.isArray(c.allowed_cities) && c.allowed_cities.length > 0) {
    if (!inList(player.city, c.allowed_cities)) return false;
  }
  if (Array.isArray(c.allowed_states) && c.allowed_states.length > 0) {
    if (!inList(player.state, c.allowed_states)) return false;
  }
  if (Array.isArray(c.allowed_clubs) && c.allowed_clubs.length > 0) {
    if (!inList(player.club, c.allowed_clubs)) return false;
  }

  return true;
};

// Value tier: Cash+Trophy > Cash+Medal > Cash > Trophy > Medal > None
const valueTier = (p: PrizeRow): number => {
  const cash = (p.cash_amount ?? 0) > 0;
  if (cash && p.has_trophy) return 4;     // Cash + Trophy
  if (cash && p.has_medal) return 3;      // Cash + Medal
  if (cash) return 2;                     // Cash only
  if (p.has_trophy) return 1;             // Trophy only
  if (p.has_medal) return 0;              // Medal only
  return -1; // no value
};

const prizeKey = (cat: CategoryRow, p: PrizeRow) => {
  return {
    order: cat.order_idx ?? 0,                 // brochure order (ASC)
    tier: valueTier(p),                        // DESC
    cash: p.cash_amount ?? 0,                  // DESC
    main: cat.is_main ? 1 : 0,                 // DESC
    place: p.place ?? 9999,                    // ASC
    pid: p.id                                  // ASC (stable)
  };
};

// Sort comparator: brochure order ASC, tier DESC, cash DESC, main DESC, place ASC, pid ASC
const cmpPrize = (a: { cat: CategoryRow; p: PrizeRow }, b: { cat: CategoryRow; p: PrizeRow }) => {
  const ak = prizeKey(a.cat, a.p), bk = prizeKey(b.cat, b.p);
  if (ak.order !== bk.order) return ak.order - bk.order;
  if (ak.tier !== bk.tier) return bk.tier - ak.tier;
  if (ak.cash !== bk.cash) return bk.cash - ak.cash;
  if (ak.main !== bk.main) return bk.main - ak.main;
  if (ak.place !== bk.place) return ak.place - bk.place;
  return String(ak.pid).localeCompare(String(bk.pid));
};
