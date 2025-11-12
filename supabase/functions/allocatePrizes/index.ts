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
  dryRun?: boolean;
}

interface CoverageItem {
  categoryId: string;
  categoryName: string;
  prizeId: string;
  place: number;
  eligibleCount: number;
  pickedCount: number;
  winnerId?: string;
  reasonCodes: string[];
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
    const { tournamentId, overrides = [], ruleConfigOverride, dryRun = false } = payload;

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

    // 3) Fetch players with FULL projection for allocation
    const REQUIRED_COLUMNS = [
      'id', 'rank', 'name', 'rating', 'dob', 'gender', 
      'state', 'city', 'club', 'fide_id', 'disability', 'unrated',
      'federation', 'sno'
    ];

    console.log(`[allocation.input] Fetching players with columns=${REQUIRED_COLUMNS.join(',')}`);

    const { data: players, error: playersError } = await supabaseClient
      .from('players')
      .select(REQUIRED_COLUMNS.join(','))
      .eq('tournament_id', tournamentId)
      .order('rank', { ascending: true });

    if (playersError) throw new Error(`Failed to fetch players: ${playersError.message}`);

    // Log actual column availability for diagnostics
    const samplePlayer = players && players[0];
    const availableColumns = samplePlayer ? Object.keys(samplePlayer) : [];
    const missingColumns = REQUIRED_COLUMNS.filter(c => !availableColumns.includes(c));

    if (missingColumns.length > 0) {
      console.warn(`[allocation.input] Missing columns in player data: ${missingColumns.join(',')}. Categories requiring these fields may have unfilled prizes.`);
    }

    console.log(`[allocation.input] columns=${availableColumns.join(',')} count=${players?.length || 0} missing=${missingColumns.join(',') || 'none'}`);

    // 4) Fetch rule config
    const { data: ruleConfig, error: ruleConfigError } = await supabaseClient
      .from('rule_config')
      .select('*')
      .eq('tournament_id', tournamentId)
      .maybeSingle();

    const verboseLogsEnv = (Deno.env.get('ALLOC_VERBOSE_LOGS') ?? '').toLowerCase();
    const envVerbose = ['1', 'true', 'yes', 'y', 'on'].includes(verboseLogsEnv);
    const coerceBool = (value: any, fallback: boolean) => {
      if (value == null) return fallback;
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        return ['1', 'true', 'yes', 'y', 'on'].includes(value.toLowerCase());
      }
      return Boolean(value);
    };

    const defaultRules = {
      strict_age: true,
      allow_unrated_in_rating: false,
      prefer_category_rank_on_tie: false,
      prefer_main_on_equal_value: true,
      category_priority_order: ['main', 'others'],
      verbose_logs: envVerbose,
    };

    const rules = {
      ...defaultRules,
      ...(ruleConfig || {}),
      ...(ruleConfigOverride || {}),
    };

    rules.verbose_logs = coerceBool(rules.verbose_logs, envVerbose);

    console.log(`[alloc] tid=${tournamentId} players=${players?.length || 0} categories=${activeCategories.length} prizes=${activePrizes.length}`);

    // Pre-flight field coverage check
    if (players && players.length > 0) {
      const sample = players[0] as any;
      const criticalFields = ['id', 'rank', 'dob', 'gender', 'rating'];
      const missingCritical = criticalFields.filter(f => sample[f] === undefined);
      
      if (missingCritical.length > 0) {
        console.error(`[alloc.preflight] CRITICAL: Missing essential player fields: ${missingCritical.join(', ')}. Allocation will likely fail.`);
      }
      
      // Count how many players have each important field populated
      const fieldCoverage: Record<string, number> = {};
      const fieldsToCheck = ['dob', 'gender', 'rating', 'state', 'city', 'club', 'disability', 'fide_id'];
      
      for (const field of fieldsToCheck) {
        fieldCoverage[field] = players.filter((p: any) => p[field] != null && p[field] !== '').length;
      }
      
      console.log(`[alloc.preflight] Field coverage (non-null):`, fieldCoverage);
    }

    // 5) Build prize queue sorted by brochure order
    const prizeQueue = activeCategories.flatMap(cat => 
      cat.prizes.map(p => ({ cat, p }))
    );

    prizeQueue.sort(cmpPrize);

    if (prizeQueue.length > 0) {
      const first = prizeKey(prizeQueue[0].cat, prizeQueue[0].p);
      console.log(`[alloc.queue] size=${prizeQueue.length} first=${JSON.stringify(first)}`);
    } else {
      console.log('[alloc.queue] size=0 first=none');
    }

    // 6) Greedy allocation: rank-first, filtered prize queue
    const winners: Array<{
      prizeId: string;
      playerId: string;
      reasons: string[];
      isManual: boolean;
    }> = [];
    const assignedPlayers = new Set<string>();
    const unfilled: Array<{ prizeId: string; reasonCodes: string[] }> = [];
    const coverageData: CoverageItem[] = [];

    // Apply manual overrides first
    for (const override of overrides) {
      assignedPlayers.add(override.playerId);
      winners.push({
        prizeId: override.prizeId,
        playerId: override.playerId,
        reasons: ['manual_override'],
        isManual: true
      });
      console.log(`[alloc.win] prize=${override.prizeId} player=${override.playerId} rank=manual reasons=manual_override`);
    }

    // Allocate prizes in brochure priority order
    for (const { cat, p } of prizeQueue) {
      // Skip if manually overridden
      if (overrides.find(o => o.prizeId === p.id)) continue;

      const eligible: Array<{ player: any; passCodes: string[] }> = [];
      const failCodes = new Set<string>();

      for (const player of (players || []) as any[]) {
        if (assignedPlayers.has(player.id)) continue;
        const evaluation = evaluateEligibility(player, cat, rules, tournamentStartDate);
        if (rules.verbose_logs) {
          const status = evaluation.eligible ? 'eligible' : 'ineligible';
          const codes = evaluation.eligible ? evaluation.passCodes : evaluation.reasonCodes;
          console.log(`[alloc.check] prize=${p.id} player=${player.id} status=${status} codes=${codes.join(',') || 'none'}`);
        }
        if (evaluation.eligible) {
          eligible.push({ player, passCodes: evaluation.passCodes });
        } else {
          evaluation.reasonCodes.forEach(code => failCodes.add(code));
        }
      }

      if (eligible.length === 0) {
        const reasonList = failCodes.size > 0 ? Array.from(failCodes).sort() : ['no_eligible_players'];
        
        // Detailed coverage diagnostic
        const categoryName = cat.name;
        const prizePlace = p.place;
        const totalPlayers = (players || []).length;
        const alreadyAssigned = assignedPlayers.size;
        const availablePool = totalPlayers - alreadyAssigned;
        
        console.log(`[allocation.coverage] category="${categoryName}" place=${prizePlace} eligible=0 picked=0 availablePool=${availablePool} reasons=${reasonList.join(',')}`);
        
        // Check if missing fields are the issue
        const fieldMissingReasons = reasonList.filter(r => 
          r.includes('missing') || r.includes('_excluded')
        );
        if (fieldMissingReasons.length > 0) {
          console.warn(`[allocation.coverage] "${categoryName}" place ${prizePlace} unfilled due to missing/excluded fields: ${fieldMissingReasons.join(', ')}`);
        }
        
        // Track coverage
        coverageData.push({
          categoryId: cat.id,
          categoryName: cat.name,
          prizeId: p.id,
          place: p.place,
          eligibleCount: 0,
          pickedCount: 0,
          reasonCodes: reasonList
        });
        
        unfilled.push({ prizeId: p.id, reasonCodes: reasonList });
        console.log(`[alloc.unfilled] prize=${p.id} reason=${reasonList.join(',')}`);
        continue;
      }

      // Deterministic tie-breaking: rank ASC → rating DESC → name ASC
      eligible.sort(compareEligibleByRankRatingName);
      const winner = eligible[0];

      // Compute tie-break reason for logging
      let tieBreak: 'none' | 'rating' | 'name' = 'none';
      if (eligible.length > 1) {
        const r0 = eligible[0].player.rank ?? Number.MAX_SAFE_INTEGER;
        const r1 = eligible[1].player.rank ?? Number.MAX_SAFE_INTEGER;
        
        if (r0 === r1) {
          // Ranks are equal, determine if tie was broken by rating or name
          const rt0 = eligible[0].player.rating ?? 0;
          const rt1 = eligible[1].player.rating ?? 0;
          tieBreak = (rt0 !== rt1) ? 'rating' : 'name';
        }
      }

      assignedPlayers.add(winner.player.id);
      const reasonSet = new Set<string>(['auto', 'rank', 'brochure_order', 'value_tier', ...winner.passCodes]);
      const reasonList = Array.from(reasonSet);
      winners.push({
        prizeId: p.id,
        playerId: winner.player.id,
        reasons: reasonList,
        isManual: false
      });

      // Track coverage
      coverageData.push({
        categoryId: cat.id,
        categoryName: cat.name,
        prizeId: p.id,
        place: p.place,
        eligibleCount: eligible.length,
        pickedCount: 1,
        winnerId: winner.player.id,
        reasonCodes: reasonList
      });

      console.log(`[alloc.win] prize=${p.id} player=${winner.player.id} rank=${winner.player.rank} tie_break=${tieBreak} reasons=${reasonList.join(',')}`);
      console.log(`[allocation.coverage] category="${cat.name}" place=${p.place} eligible=${eligible.length} picked=1 winner=${winner.player.id}`);
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
      for (const player of (players || []) as any[]) {
        const evaluation = evaluateEligibility(player, cat, rules, tournamentStartDate);
        if (evaluation.eligible) {
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

    // Unfilled prizes summary
    if (unfilled.length > 0) {
      const unfilledCategories = new Set<string>();
      const unfilledReasons = new Set<string>();
      
      for (const uf of unfilled) {
        // Find the category for this prize
        const prizeMatch = prizeQueue.find(pq => pq.p.id === uf.prizeId);
        if (prizeMatch) {
          unfilledCategories.add(prizeMatch.cat.name);
        }
        uf.reasonCodes.forEach(r => unfilledReasons.add(r));
      }
      
      console.warn(`[allocation.unfilled] count=${unfilled.length} categories=[${Array.from(unfilledCategories).join(', ')}] commonReasons=[${Array.from(unfilledReasons).join(', ')}]`);
      
      // Check for systemic missing fields
      const missingFieldReasons = Array.from(unfilledReasons).filter(r => r.includes('missing'));
      if (missingFieldReasons.length > 0) {
        console.error(`[allocation.unfilled] CRITICAL: Missing player fields causing unfilled prizes: ${missingFieldReasons.join(', ')}`);
      }
    }

    console.log(`[alloc.done] winners=${winners.length} conflicts=${conflicts.length} unfilled=${unfilled.length} dryRun=${dryRun}`);

    if (dryRun) {
      console.log(`[alloc] DRY-RUN mode: skipping DB writes`);
    }

    return new Response(
      JSON.stringify({
        winners,
        conflicts,
        unfilled,
        coverage: dryRun ? coverageData : undefined,
        meta: {
          playerCount: players?.length || 0,
          activeCategoryCount: activeCategories.length,
          activePrizeCount: activePrizes.length,
          winnersCount: winners.length,
          conflictCount: conflicts.length,
          unfilledCount: unfilled.length,
          dryRun
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

type EligibilityResult = {
  eligible: boolean;
  reasonCodes: string[];
  passCodes: string[];
};

const evaluateEligibility = (player: any, cat: CategoryRow, rules: any, onDate: Date): EligibilityResult => {
  const c = cat.criteria_json || {};
  const failCodes = new Set<string>();
  const passCodes = new Set<string>();

  // Gender check
  const reqG = c.gender?.toUpperCase?.() || null; // 'M' | 'F' | 'OPEN' | undefined
  const pg = normGender(player.gender);
  if (reqG === 'M') {
    if (!pg) {
      failCodes.add('gender_missing');
    } else if (pg !== 'M') {
      failCodes.add('gender_mismatch');
    } else {
      passCodes.add('gender_ok');
    }
  } else if (reqG === 'F') {
    if (!pg) {
      failCodes.add('gender_missing');
    } else if (pg !== 'F') {
      failCodes.add('gender_mismatch');
    } else {
      passCodes.add('gender_ok');
    }
  } else {
    passCodes.add('gender_open');
  }

  // Age (strict ON by default)
  const strict = rules?.strict_age !== false;
  const age = yearsOn(player.dob ?? null, onDate);
  const hasAgeRule = strict && (c.max_age != null || c.min_age != null);
  let ageOk = true;
  if (hasAgeRule) {
    if (age == null) {
      failCodes.add('dob_missing');
      ageOk = false;
    } else {
      if (c.max_age != null && age > Number(c.max_age)) {
        failCodes.add('age_above_max');
        ageOk = false;
      }
      if (c.min_age != null && age < Number(c.min_age)) {
        failCodes.add('age_below_min');
        ageOk = false;
      }
    }
    if (ageOk) {
      passCodes.add('age_ok');
    }
  }

  // Rating category handling
  const ratingCat = isRatingCategory(c);
  const allowUnrated = !!rules?.allow_unrated_in_rating;
  const rating = (player.rating == null ? null : Number(player.rating));
  if (ratingCat) {
    let ratingOk = true;
    if ((rating == null || rating === 0)) {
      if (!allowUnrated) {
        failCodes.add('unrated_excluded');
        ratingOk = false;
      } else {
        passCodes.add('rating_unrated_allowed');
      }
    }

    if (rating != null) {
      if (c.min_rating != null && rating < Number(c.min_rating)) {
        failCodes.add('rating_below_min');
        ratingOk = false;
      }
      if (c.max_rating != null && rating > Number(c.max_rating)) {
        failCodes.add('rating_above_max');
        ratingOk = false;
      }
    }

    if (ratingOk && !(rating == null && allowUnrated)) {
      passCodes.add('rating_ok');
    }
  }

  // Optional filters (disability/city/state/club lists)
  const inList = (val: any, arr?: any[]) =>
    !arr || arr.length === 0 || arr.map(x => String(x).toLowerCase()).includes(String(val ?? '').toLowerCase());

  if (Array.isArray(c.allowed_disabilities) && c.allowed_disabilities.length > 0) {
    if (!inList(player.disability, c.allowed_disabilities)) {
      failCodes.add('disability_excluded');
    } else {
      passCodes.add('disability_ok');
    }
  }
  if (Array.isArray(c.allowed_cities) && c.allowed_cities.length > 0) {
    if (!inList(player.city, c.allowed_cities)) {
      failCodes.add('city_excluded');
    } else {
      passCodes.add('city_ok');
    }
  }
  if (Array.isArray(c.allowed_states) && c.allowed_states.length > 0) {
    if (!inList(player.state, c.allowed_states)) {
      failCodes.add('state_excluded');
    } else {
      passCodes.add('state_ok');
    }
  }
  if (Array.isArray(c.allowed_clubs) && c.allowed_clubs.length > 0) {
    if (!inList(player.club, c.allowed_clubs)) {
      failCodes.add('club_excluded');
    } else {
      passCodes.add('club_ok');
    }
  }

  const eligible = failCodes.size === 0;
  return {
    eligible,
    reasonCodes: Array.from(failCodes),
    passCodes: Array.from(passCodes),
  };
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

/**
 * Deterministic comparator for eligible players.
 * Sort order: rank ASC → rating DESC → name ASC
 * Exported for testing.
 */
export function compareEligibleByRankRatingName(
  a: { player: { rank?: number | null; rating?: number | null; name?: string | null } },
  b: { player: { rank?: number | null; rating?: number | null; name?: string | null } }
): number {
  // Primary: rank ascending (lower rank = better)
  const rankA = a.player.rank ?? Number.MAX_SAFE_INTEGER;
  const rankB = b.player.rank ?? Number.MAX_SAFE_INTEGER;
  if (rankA !== rankB) return rankA - rankB;

  // Secondary: rating descending (higher rating = better)
  const ratingA = a.player.rating ?? 0;
  const ratingB = b.player.rating ?? 0;
  if (ratingA !== ratingB) return ratingB - ratingA;

  // Tertiary: name ascending (alphabetical)
  const nameA = (a.player.name ?? '').toString();
  const nameB = (b.player.name ?? '').toString();
  return nameA.localeCompare(nameB);
}
