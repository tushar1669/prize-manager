import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://prize-manager.lovable.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

interface AllocatePrizesRequest {
  tournamentId: string;
  overrides?: Array<{ prizeId: string; playerId: string; force?: boolean }>;
  ruleConfigOverride?: any;
  dryRun?: boolean;
  tieBreakStrategy?: TieBreakStrategy;
}

type TieBreakField = 'rating' | 'name';
type TieBreakStrategy = 'rating_then_name' | 'none' | TieBreakField[];

export function normalizeTieBreakStrategy(strategy: TieBreakStrategy | undefined): TieBreakField[] {
  if (Array.isArray(strategy)) return strategy.filter((s): s is TieBreakField => s === 'rating' || s === 'name');
  if (strategy === 'none') return [];
  return ['rating', 'name'];
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
    const { tournamentId, overrides = [], ruleConfigOverride, dryRun = false, tieBreakStrategy } = payload;

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
    if (!players) throw new Error('No players data returned');

    // Double assertion to work around TypeScript's union type narrowing limitation
    const playerRows = players as unknown as Array<{
      id: string;
      rank?: number | null;
      name?: string | null;
      rating?: number | null;
      dob?: string | null;
      gender?: string | null;
      state?: string | null;
      city?: string | null;
      club?: string | null;
      fide_id?: string | null;
      disability?: string | null;
      unrated?: boolean;
      federation?: string | null;
      sno?: string | null;
    }>;

    // Log actual column availability for diagnostics
    const samplePlayer = playerRows[0];
    const availableColumns = samplePlayer ? Object.keys(samplePlayer) : [];
    const missingColumns = REQUIRED_COLUMNS.filter(c => !availableColumns.includes(c));

    if (missingColumns.length > 0) {
      console.warn(`[allocation.input] Missing columns in player data: ${missingColumns.join(',')}. Categories requiring these fields may have unfilled prizes.`);
    }

    console.log(`[allocation.input] columns=${availableColumns.join(',')} count=${playerRows.length} missing=${missingColumns.join(',') || 'none'}`);

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
      allow_missing_dob_for_age: false,
      max_age_inclusive: true,
      prefer_category_rank_on_tie: false,
      prefer_main_on_equal_value: true,
      category_priority_order: ['main', 'others'],
      tie_break_strategy: 'rating_then_name' as TieBreakStrategy,
      verbose_logs: envVerbose,
    };

    const rules = {
      ...defaultRules,
      ...(ruleConfig || {}),
      ...(ruleConfigOverride || {}),
      ...(tieBreakStrategy ? { tie_break_strategy: tieBreakStrategy } : {}),
    };

    // Support camelCase override for API callers
    if (rules.tieBreakStrategy && !rules.tie_break_strategy) {
      rules.tie_break_strategy = rules.tieBreakStrategy;
    }

    const tieBreakFields = normalizeTieBreakStrategy(rules.tie_break_strategy);

    rules.verbose_logs = coerceBool(rules.verbose_logs, envVerbose);

    console.log(`[alloc] tid=${tournamentId} players=${playerRows.length} categories=${activeCategories.length} prizes=${activePrizes.length}`);

    // Pre-flight field coverage check
    if (playerRows.length > 0) {
      const sample = playerRows[0] as any;
      const criticalFields = ['id', 'rank', 'dob', 'gender', 'rating'];
      const missingCritical = criticalFields.filter(f => sample[f] === undefined);
      
      if (missingCritical.length > 0) {
        console.error(`[alloc.preflight] CRITICAL: Missing essential player fields: ${missingCritical.join(', ')}. Allocation will likely fail.`);
      }
      
      // Count how many players have each important field populated
      const fieldCoverage: Record<string, number> = {};
      const fieldsToCheck = ['dob', 'gender', 'rating', 'state', 'city', 'club', 'disability', 'fide_id'];
      
      for (const field of fieldsToCheck) {
        fieldCoverage[field] = playerRows.filter((p: any) => p[field] != null && p[field] !== '').length;
      }
      
      console.log(`[alloc.preflight] Field coverage (non-null):`, fieldCoverage);
    }

    // 5) Build prize queue sorted GLOBALLY by cash amount first (max-cash-per-player semantics)
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
    const conflicts: Array<{
      id: string;
      type: string;
      impacted_players: string[];
      impacted_prizes: string[];
      reasons: string[];
      suggested: { prizeId: string; playerId: string } | null;
      tournament_id: string;
    }> = [];
    const unfilled: Array<{ prizeId: string; reasonCodes: string[] }> = [];
    const coverageData: CoverageItem[] = [];

    // Apply manual overrides first
    const prizeLookup = new Map<string, { cat: CategoryRow; p: PrizeRow }>(
      prizeQueue.map(entry => [entry.p.id, entry])
    );
    const playerLookup = new Map<string, any>(
      playerRows.map(p => [p.id, p])
    );

    for (const override of overrides) {
      const prizeContext = prizeLookup.get(override.prizeId);
      const player = playerLookup.get(override.playerId);
      const force = override.force === true;

      const evaluation = (prizeContext && player)
        ? evaluateEligibility(player, prizeContext.cat, rules, tournamentStartDate)
        : null;
      const eligible = evaluation?.eligible === true;

      if (!eligible && !force) {
        const reasons = ['manual_override_ineligible'];
        if (evaluation?.reasonCodes?.length) {
          reasons.push(...evaluation.reasonCodes);
        }
        if (!prizeContext || !player) {
          reasons.push('manual_override_missing_context');
        }

        conflicts.push({
          id: crypto.randomUUID(),
          type: 'manual_override',
          impacted_players: [override.playerId],
          impacted_prizes: [override.prizeId],
          reasons,
          suggested: null,
          tournament_id: tournamentId,
        });

        console.warn(`[alloc.override] prize=${override.prizeId} player=${override.playerId} status=ineligible reasons=${reasons.join(',')}`);
        continue;
      }

      assignedPlayers.add(override.playerId);
      const reasons = new Set<string>([
        force && !eligible ? 'manual_override_forced' : 'manual_override',
        ...(evaluation?.passCodes || []),
        ...(evaluation?.warnCodes || [])
      ]);
      winners.push({
        prizeId: override.prizeId,
        playerId: override.playerId,
        reasons: Array.from(reasons),
        isManual: true
      });
      console.log(`[alloc.win] prize=${override.prizeId} player=${override.playerId} rank=manual reasons=${Array.from(reasons).join(',')}`);
    }

    // Allocate prizes in brochure priority order
    for (const { cat, p } of prizeQueue) {
      // Skip if manually overridden
      if (overrides.find(o => o.prizeId === p.id)) continue;

      const eligible: Array<{ player: any; passCodes: string[]; warnCodes: string[] }> = [];
      const failCodes = new Set<string>();

      for (const player of playerRows) {
        if (assignedPlayers.has(player.id)) continue;
        const evaluation = evaluateEligibility(player, cat, rules, tournamentStartDate);
        if (rules.verbose_logs) {
          const status = evaluation.eligible ? 'eligible' : 'ineligible';
          const codes = evaluation.eligible
            ? [...evaluation.passCodes, ...evaluation.warnCodes]
            : evaluation.reasonCodes;
          console.log(`[alloc.check] prize=${p.id} player=${player.id} status=${status} codes=${codes.join(',') || 'none'}`);
        }
        if (evaluation.eligible) {
          eligible.push({ player, passCodes: evaluation.passCodes, warnCodes: evaluation.warnCodes });
        } else {
          evaluation.reasonCodes.forEach(code => failCodes.add(code));
        }
      }

      if (eligible.length === 0) {
        const reasonList = failCodes.size > 0 ? Array.from(failCodes).sort() : ['no_eligible_players'];
        
        // Detailed coverage diagnostic
        const categoryName = cat.name;
        const prizePlace = p.place;
        const totalPlayers = playerRows.length;
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

      // Deterministic tie-breaking based on configured strategy
      eligible.sort((a, b) => compareEligibleByRankRatingName(a, b, tieBreakFields));
      const winner = eligible[0];

      // Compute tie-break reason for logging
      let tieBreak: 'none' | TieBreakField = 'none';
      if (eligible.length > 1) {
        const r0 = eligible[0].player.rank ?? Number.MAX_SAFE_INTEGER;
        const r1 = eligible[1].player.rank ?? Number.MAX_SAFE_INTEGER;

        if (r0 === r1) {
          for (const field of tieBreakFields) {
            if (field === 'rating') {
              const rt0 = eligible[0].player.rating ?? 0;
              const rt1 = eligible[1].player.rating ?? 0;
              if (rt0 !== rt1) {
                tieBreak = 'rating';
                break;
              }
            }
            if (field === 'name') {
              const nameA = (eligible[0].player.name ?? '').toString();
              const nameB = (eligible[1].player.name ?? '').toString();
              if (nameA !== nameB) {
                tieBreak = 'name';
                break;
              }
            }
          }
        }
      }

      assignedPlayers.add(winner.player.id);
      const reasonSet = new Set<string>(['auto', 'rank', 'max_cash_priority', ...winner.passCodes, ...winner.warnCodes]);
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
    
    // Build eligibility map: player -> prizes they're eligible for
    const playerEligiblePrizes = new Map<string, Array<{ cat: CategoryRow; p: PrizeRow }>>();
    for (const { cat, p } of prizeQueue) {
      for (const player of playerRows) {
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
          playerCount: playerRows.length,
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

export const normGender = (g?: string | null): string | null => {
  if (!g) return null;
  const s = String(g).trim().toLowerCase();
  if (['m', 'male', 'boy', 'boys'].includes(s)) return 'M';
  if (['f', 'female', 'girl', 'girls'].includes(s)) return 'F';
  return null;
};

export const yearsOn = (dobISO: string | null | undefined, onDate: Date): number | null => {
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
export const isRatingCategory = (criteria: any): boolean =>
  criteria && (typeof criteria.min_rating === 'number' || typeof criteria.max_rating === 'number');

type EligibilityResult = {
  eligible: boolean;
  reasonCodes: string[];
  passCodes: string[];
  warnCodes: string[];
};

type LocationType = 'state' | 'city' | 'club';
type AliasSpec = Record<string, string | string[]> | string[] | undefined;

const STATE_ALIASES: Record<string, string> = {
  MH: 'MAHARASHTRA',
  KA: 'KARNATAKA',
  KN: 'KARNATAKA',
  TN: 'TAMIL NADU',
  DL: 'DELHI',
  GJ: 'GUJARAT',
  RJ: 'RAJASTHAN',
  WB: 'WEST BENGAL',
  KL: 'KERALA',
};

const normalizeLocation = (raw: any, type?: LocationType): string => {
  const str = String(raw ?? '').trim();
  if (!str) return '';

  const upper = str.toUpperCase();
  if (type === 'state') {
    const mapped = STATE_ALIASES[upper];
    if (mapped) return mapped.toLowerCase();
    if (/^[A-Z]{2,3}$/.test(upper)) return upper.toLowerCase();
  }

  return upper.toLowerCase();
};

const buildAliasLookup = (aliases: AliasSpec, type?: LocationType): Map<string, string> => {
  const lookup = new Map<string, string>();
  if (!aliases) return lookup;

  const addAlias = (alias: string, canonical?: string) => {
    const normAlias = normalizeLocation(alias, type);
    if (!normAlias) return;
    const normCanonical = normalizeLocation(canonical ?? alias, type);
    if (!normCanonical) return;
    lookup.set(normAlias, normCanonical);
  };

  if (Array.isArray(aliases)) {
    aliases.forEach((alias) => addAlias(alias));
  } else {
    for (const [canonical, aliasList] of Object.entries(aliases)) {
      if (Array.isArray(aliasList)) {
        aliasList.forEach((alias) => addAlias(alias, canonical));
      } else if (aliasList) {
        addAlias(aliasList, canonical);
      }
      addAlias(canonical, canonical);
    }
  }

  return lookup;
};

const normalizeAllowedList = (values: any[] | undefined, aliases: AliasSpec, type?: LocationType) => {
  const aliasLookup = buildAliasLookup(aliases, type);
  const allowedSet = new Set<string>();

  if (Array.isArray(values)) {
    values.forEach((v) => {
      const norm = normalizeLocation(v, type);
      if (norm) allowedSet.add(norm);
    });
  }

  for (const target of aliasLookup.values()) {
    allowedSet.add(target);
  }

  return { allowedSet, aliasLookup };
};

const matchesLocation = (value: any, values?: any[], aliases?: AliasSpec, type?: LocationType): boolean => {
  if (!Array.isArray(values) || values.length === 0) return true;

  const { allowedSet, aliasLookup } = normalizeAllowedList(values, aliases, type);
  const norm = normalizeLocation(value, type);
  if (!norm) return false;
  const canonical = aliasLookup.get(norm) ?? norm;
  return allowedSet.has(canonical);
};

export const evaluateEligibility = (player: any, cat: CategoryRow, rules: any, onDate: Date): EligibilityResult => {
  const c = cat.criteria_json || {};
  const failCodes = new Set<string>();
  const passCodes = new Set<string>();
  const warnCodes = new Set<string>();

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
  const allowMissingDob = c.allow_missing_dob_for_age != null
    ? !!c.allow_missing_dob_for_age
    : !!rules?.allow_missing_dob_for_age;
  const maxAgeInclusive = c.max_age_inclusive != null
    ? !!c.max_age_inclusive
    : rules?.max_age_inclusive ?? true;
  const age = yearsOn(player.dob ?? null, onDate);
  const hasAgeRule = strict && (c.max_age != null || c.min_age != null);
  let ageOk = true;
  if (hasAgeRule) {
    if (age == null) {
      if (allowMissingDob) {
        warnCodes.add('dob_missing_allowed');
      } else {
        failCodes.add('dob_missing');
        ageOk = false;
      }
    } else {
      if (c.max_age != null) {
        const maxAge = Number(c.max_age);
        const exceeds = maxAgeInclusive ? age > maxAge : age >= maxAge;
        if (exceeds) {
          failCodes.add('age_above_max');
          ageOk = false;
        }
      }
      if (c.min_age != null && age < Number(c.min_age)) {
        failCodes.add('age_below_min');
        ageOk = false;
      }
    }
    if (ageOk && age != null) {
      passCodes.add('age_ok');
    }
  }

  // Rating category handling
  // Detect unrated_only mode: category only allows unrated players
  const unratedOnly = c.unrated_only === true;
  // A category is rating-aware if it has min/max rating OR is unrated-only
  const ratingCat = isRatingCategory(c) || unratedOnly;
  const includeUnratedByCriteria = c.include_unrated;
  const includeUnratedProvided = includeUnratedByCriteria === true || includeUnratedByCriteria === false;
  const maxOnlyBandAllowsUnrated = c.max_rating != null && c.min_rating == null;
  const legacyAllowUnrated = (rules?.allow_unrated_in_rating === true) || maxOnlyBandAllowsUnrated;
  // Apply include_unrated override if provided; otherwise, use legacy rules. unrated_only always allows unrated.
  const allowUnrated = unratedOnly
    || includeUnratedByCriteria === true
    || (!includeUnratedProvided && legacyAllowUnrated);

  const rating = (() => {
    const raw = player.rating == null ? null : Number(player.rating);
    if (raw == null) return null;
    return raw <= 0 ? null : raw;
  })();

  // Determine if player is unrated
  const isUnrated = (rating == null || rating === 0) || player?.unrated === true;

  if (ratingCat) {
    let ratingOk = true;

    // Handle unrated-only mode first (takes precedence over everything else)
    if (unratedOnly) {
      if (!isUnrated) {
        // Rated players are excluded in unrated-only categories
        failCodes.add('rated_player_excluded_unrated_only');
        ratingOk = false;
      } else {
        // Unrated players pass the rating dimension
        passCodes.add('unrated_only_ok');
      }
      // Skip min/max rating checks entirely for unrated-only categories
    } else {
      // Standard rating category logic (not unrated-only)
      if (isUnrated) {
        if (!allowUnrated) {
          failCodes.add('unrated_excluded');
          ratingOk = false;
        } else {
          passCodes.add('rating_unrated_allowed');
        }
      }

      // Apply min/max rating checks only for rated players in non-unrated-only categories
      if (rating != null && !isUnrated) {
        if (c.min_rating != null && rating < Number(c.min_rating)) {
          failCodes.add('rating_below_min');
          ratingOk = false;
        }
        if (c.max_rating != null && rating > Number(c.max_rating)) {
          failCodes.add('rating_above_max');
          ratingOk = false;
        }
      }

      if (ratingOk && !isUnrated) {
        passCodes.add('rating_ok');
      }
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
      console.log('[alloc.eligibility] disability check', {
        player: player.name,
        playerDisability: player.disability,
        allowedDisabilities: c.allowed_disabilities,
        eligible: true
      });
    }
  }
  if (Array.isArray(c.allowed_cities) && c.allowed_cities.length > 0) {
    if (!matchesLocation(player.city, c.allowed_cities, c.city_aliases, 'city')) {
      failCodes.add('city_excluded');
    } else {
      passCodes.add('city_ok');
    }
  }
  if (Array.isArray(c.allowed_states) && c.allowed_states.length > 0) {
    if (!matchesLocation(player.state, c.allowed_states, c.state_aliases, 'state')) {
      failCodes.add('state_excluded');
    } else {
      passCodes.add('state_ok');
    }
  }
  if (Array.isArray(c.allowed_clubs) && c.allowed_clubs.length > 0) {
    if (!matchesLocation(player.club, c.allowed_clubs, c.club_aliases, 'club')) {
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
    warnCodes: Array.from(warnCodes),
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

export const prizeKey = (cat: CategoryRow, p: PrizeRow) => {
  return {
    cash: p.cash_amount ?? 0,                  // PRIMARY: cash DESC (max-cash-per-player)
    main: cat.is_main ? 1 : 0,                 // DESC (prefer main when cash equal)
    order: cat.order_idx ?? 0,                 // brochure order ASC
    place: p.place ?? 9999,                    // ASC (1st, 2nd, 3rd...)
    pid: p.id                                  // ASC (stable tie-breaker)
  };
};

// Sort comparator: CASH DESC (highest first), main DESC (prefer main when equal), order ASC, place ASC, pid ASC
// This implements "max-cash-per-player" semantics: each player gets the highest-value prize they're eligible for
export const cmpPrize = (a: { cat: CategoryRow; p: PrizeRow }, b: { cat: CategoryRow; p: PrizeRow }) => {
  const ak = prizeKey(a.cat, a.p), bk = prizeKey(b.cat, b.p);
  
  // PRIMARY: Cash amount descending (highest cash first)
  if (ak.cash !== bk.cash) return bk.cash - ak.cash;
  
  // When cash equal, prefer main category
  if (ak.main !== bk.main) return bk.main - ak.main;
  
  // Then brochure order
  if (ak.order !== bk.order) return ak.order - bk.order;
  
  // Then place within category
  if (ak.place !== bk.place) return ak.place - bk.place;
  
  // Finally stable by prize ID
  return String(ak.pid).localeCompare(String(bk.pid));
};

/**
 * Deterministic comparator for eligible players.
 * Sort order: rank ASC → configurable tie-breaks (rating DESC, name ASC)
 * Exported for testing.
 */
export function compareEligibleByRankRatingName(
  a: { player: { rank?: number | null; rating?: number | null; name?: string | null } },
  b: { player: { rank?: number | null; rating?: number | null; name?: string | null } },
  tieBreakStrategy?: TieBreakStrategy
): number {
  // Primary: rank ascending (lower rank = better)
  const rankA = a.player.rank ?? Number.MAX_SAFE_INTEGER;
  const rankB = b.player.rank ?? Number.MAX_SAFE_INTEGER;
  if (rankA !== rankB) return rankA - rankB;

  const tieBreaks = normalizeTieBreakStrategy(tieBreakStrategy);

  for (const field of tieBreaks) {
    if (field === 'rating') {
      // rating descending (higher rating = better)
      const ratingA = a.player.rating ?? 0;
      const ratingB = b.player.rating ?? 0;
      if (ratingA !== ratingB) return ratingB - ratingA;
    }

    if (field === 'name') {
      // name ascending (alphabetical)
      const nameA = (a.player.name ?? '').toString();
      const nameB = (b.player.name ?? '').toString();
      const cmp = nameA.localeCompare(nameB);
      if (cmp !== 0) return cmp;
    }
  }

  return 0;
}
