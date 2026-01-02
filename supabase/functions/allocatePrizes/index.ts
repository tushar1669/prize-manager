import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, hasPingQueryParam, isPingBody, pingResponse } from "../_shared/health.ts";

const BUILD_VERSION = "2025-12-20T20:00:00Z";
const FUNCTION_NAME = "allocatePrizes";

const corsHeaders = CORS_HEADERS;

interface AllocatePrizesRequest {
  tournamentId: string;
  overrides?: Array<{ prizeId: string; playerId: string; force?: boolean }>;
  ruleConfigOverride?: unknown;
  dryRun?: boolean;
  tieBreakStrategy?: TieBreakStrategy;
}

const GENDER_DEBUG_TOURNAMENT_ID = '74e1bd2b-0b3b-4cd6-abfc-30a6a7c2bf15';

type TieBreakField = 'rating' | 'name';
type TieBreakStrategy = 'rating_then_name' | 'none' | TieBreakField[];
export type MultiPrizePolicy = 'single' | 'main_plus_one_side' | 'unlimited';
export type MainVsSidePriorityMode = 'main_first' | 'place_first';

export function normalizeTieBreakStrategy(strategy: TieBreakStrategy | undefined): TieBreakField[] {
  if (Array.isArray(strategy)) return strategy.filter((s): s is TieBreakField => s === 'rating' || s === 'name');
  if (strategy === 'none') return [];
  return ['rating', 'name'];
}

// Enhanced coverage entry type for debug reporting
interface CoverageItem {
  categoryId: string;
  categoryName: string;
  prizeId: string;
  place: number;
  eligibleCount: number;
  pickedCount: number;
  winnerId?: string;
  reasonCodes: string[];
  
  // Debug stats
  prize_id: string;
  category_id: string | null;
  category_name: string;
  prize_place: number;
  prize_label: string;
  prize_type: 'cash' | 'trophy' | 'medal' | 'other';
  amount: number | null;
  
  winner_player_id: string | null;
  winner_rank: number | null;
  winner_rating: number | null;
  winner_name: string | null;
  
  candidates_before_one_prize: number;
  candidates_after_one_prize: number;
  reason_code: string | null;
  reason_details: string | null;
  
  is_main: boolean;
  is_category: boolean;
  is_unfilled: boolean;
  is_blocked_by_one_prize: boolean;
  raw_fail_codes: string[];
  diagnosis_summary: string | null;
  
  // Prize priority hierarchy explanation
  priority_explanation: string;
  has_trophy: boolean;
  has_medal: boolean;
}

// Helper to derive prize type for display (uses cash as primary if present)
function derivePrizeType(p: PrizeRow): 'cash' | 'trophy' | 'medal' | 'other' {
  if ((p.cash_amount ?? 0) > 0) return 'cash';
  if (p.has_trophy) return 'trophy';
  if (p.has_medal) return 'medal';
  return 'other';
}

// Build priority explanation string for debug output
function buildPriorityExplanation(
  cat: CategoryRow,
  p: PrizeRow,
  mainVsSidePriorityMode: MainVsSidePriorityMode = 'place_first'
): string {
  const preferMainFirst = mainVsSidePriorityMode === 'main_first';
  const parts: string[] = [];
  const cash = p.cash_amount ?? 0;
  
  parts.push(`cash=₹${cash}`);
  parts.push(`type=${p.has_trophy ? 'trophy' : p.has_medal ? 'medal' : 'none'}`);
  if (preferMainFirst) {
    parts.push(`main=${cat.is_main ? 'yes' : 'no'} (priority)`);
  }
  parts.push(`place=${p.place}`);
  if (!preferMainFirst) {
    parts.push(`main=${cat.is_main ? 'yes' : 'no'}`);
  }
  parts.push(`order=${cat.order_idx ?? 0}`);
  
  return parts.join(', ');
}

// Helper to derive reason code
function deriveReasonCode(
  rawFailCodes: string[],
  candidatesBeforeOnePrize: number,
  candidatesAfterOnePrize: number
): string | null {
  if (candidatesBeforeOnePrize > 0 && candidatesAfterOnePrize === 0) {
    return 'BLOCKED_BY_ONE_PRIZE_POLICY';
  }

  if (candidatesBeforeOnePrize === 0) {
    const hasRating = rawFailCodes.some(c =>
      c.includes('rating') || c.includes('unrated')
    );
    const hasAge = rawFailCodes.some(c => c.includes('age') || c.includes('dob'));
    const hasGender = rawFailCodes.some(c => c.includes('gender'));
    const hasLocation = rawFailCodes.some(c =>
      c.includes('state') || c.includes('city') || c.includes('club')
    );
    const hasTypeOrGroup = rawFailCodes.some(c =>
      c.includes('type') || c.includes('group')
    );

    if (hasRating) return 'TOO_STRICT_CRITERIA_RATING';
    if (hasAge) return 'TOO_STRICT_CRITERIA_AGE';
    if (hasGender) return 'TOO_STRICT_CRITERIA_GENDER';
    if (hasLocation) return 'TOO_STRICT_CRITERIA_LOCATION';
    if (hasTypeOrGroup) return 'TOO_STRICT_CRITERIA_TYPE_OR_GROUP';

    return 'NO_ELIGIBLE_PLAYERS';
  }

  return null;
}

// Helper to build diagnosis summary for 0-candidate categories
function buildDiagnosisSummary(
  rawFailCodes: string[],
  cat: CategoryRow,
  candidatesBeforeOnePrize: number
): string | null {
  if (candidatesBeforeOnePrize > 0) {
    return null; // Only diagnose when there were 0 candidates
  }

  const issues: string[] = [];
  const criteria = cat.criteria_json || {};

  // Check each criteria dimension
  if (rawFailCodes.some(c => c.includes('rating') || c.includes('unrated'))) {
    const minRating = criteria.min_rating;
    const maxRating = criteria.max_rating;
    const unratedOnly = criteria.unrated_only;
    if (unratedOnly) {
      issues.push('Unrated-only category but no unrated players found');
    } else if (minRating != null && maxRating != null) {
      issues.push(`Rating band ${minRating}–${maxRating} excludes all players`);
    } else if (minRating != null) {
      issues.push(`Min rating ${minRating} too high for player pool`);
    } else if (maxRating != null) {
      issues.push(`Max rating ${maxRating} too low for player pool`);
    } else {
      issues.push('Rating criteria exclude all players');
    }
  }

  if (rawFailCodes.some(c => c.includes('age') || c.includes('dob'))) {
    const minAge = criteria.min_age;
    const maxAge = criteria.max_age;
    if (minAge != null && maxAge != null) {
      issues.push(`Age ${minAge}–${maxAge} excludes all players`);
    } else if (minAge != null) {
      issues.push(`No players aged ${minAge}+ found`);
    } else if (maxAge != null) {
      issues.push(`No players under ${maxAge} found`);
    } else {
      issues.push('Age criteria exclude all players');
    }
  }

  if (rawFailCodes.some(c => c.includes('gender'))) {
    const gender = criteria.gender;
    if (gender) {
      issues.push(`No players with gender=${gender} found`);
    } else {
      issues.push('Gender criteria exclude all players');
    }
  }

  if (rawFailCodes.some(c => c.includes('state') || c.includes('city') || c.includes('club'))) {
    const states = criteria.allowed_states;
    const cities = criteria.allowed_cities;
    const clubs = criteria.allowed_clubs;
    const parts: string[] = [];
    if (states?.length) parts.push(`state in [${states.slice(0, 3).join(', ')}${states.length > 3 ? '...' : ''}]`);
    if (cities?.length) parts.push(`city in [${cities.slice(0, 3).join(', ')}${cities.length > 3 ? '...' : ''}]`);
    if (clubs?.length) parts.push(`club in [${clubs.slice(0, 3).join(', ')}${clubs.length > 3 ? '...' : ''}]`);
    if (parts.length) {
      issues.push(`No players match location: ${parts.join(', ')}`);
    } else {
      issues.push('Location criteria exclude all players');
    }
  }

  if (rawFailCodes.some(c => c.includes('type'))) {
    const types = criteria.allowed_types;
    if (types?.length) {
      issues.push(`No players with type in [${types.slice(0, 3).join(', ')}${types.length > 3 ? '...' : ''}]`);
    } else {
      issues.push('Type criteria exclude all players');
    }
  }

  if (rawFailCodes.some(c => c.includes('group'))) {
    const groups = criteria.allowed_groups;
    if (groups?.length) {
      issues.push(`No players with group in [${groups.slice(0, 3).join(', ')}${groups.length > 3 ? '...' : ''}]`);
    } else {
      issues.push('Group criteria exclude all players');
    }
  }

  if (rawFailCodes.some(c => c.includes('disability'))) {
    const disabilities = criteria.allowed_disabilities;
    if (disabilities?.length) {
      issues.push(`No players with disability in [${disabilities.join(', ')}]`);
    } else {
      issues.push('Disability criteria exclude all players');
    }
  }

  if (issues.length === 0) {
    return 'No players match the combined criteria';
  }

  return issues.join('; ');
}

// Helper to build a prize label
function buildPrizeLabel(cat: CategoryRow, p: PrizeRow): string {
  const ordinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  return `${ordinal(p.place)} ${cat.name}`;
}

type PrizeRow = {
  id: string;
  place: number;
  cash_amount: number | null;
  has_trophy: boolean;
  has_medal: boolean;
  is_active?: boolean;
};

// Type for criteria_json to avoid unknown type errors
type CriteriaJson = {
  min_rating?: number | null;
  max_rating?: number | null;
  unrated_only?: boolean;
  min_age?: number | null;
  max_age?: number | null;
  gender?: string | null;
  allowed_states?: string[] | null;
  allowed_cities?: string[] | null;
  allowed_clubs?: string[] | null;
  allowed_types?: string[] | null;
  allowed_groups?: string[] | null;
  allowed_disabilities?: string[] | null;
  category_type?: string | null;
  [key: string]: unknown;
};

type CategoryRow = {
  id: string;
  name: string;
  is_main: boolean;
  order_idx: number;
  is_active?: boolean;
  category_type?: string | null;
  criteria_json?: CriteriaJson;
  prizes: PrizeRow[];
};

// Player row type for allocation
type PlayerRow = {
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
  group_label?: string | null;
  type_label?: string | null;
};

type AssignedPrizeInfo = { category: CategoryRow; prize: PrizeRow };

// Legacy behaviour kept: default policy is single-prize-per-player unless a tournament opts in.
export function canPlayerTakePrize(opts: {
  policy: MultiPrizePolicy;
  category: CategoryRow;
  playerId: string;
  assignments: Map<string, AssignedPrizeInfo[]>;
}): boolean {
  const { policy, category, playerId, assignments } = opts;
  const existing = assignments.get(playerId) ?? [];

  if (policy === 'unlimited') return true;
  if (policy === 'single') return existing.length === 0;

  const mainCount = existing.filter(a => a.category.is_main).length;
  const sideCount = existing.length - mainCount;
  const isMain = category.is_main === true;

  if (isMain) return mainCount === 0 && existing.length < 2;
  return sideCount === 0 && existing.length < 2;
}

function recordAssignment(
  assignments: Map<string, AssignedPrizeInfo[]>,
  playerId: string,
  entry: AssignedPrizeInfo
) {
  const list = assignments.get(playerId) ?? [];
  list.push(entry);
  assignments.set(playerId, list);
}

Deno.serve(async (req) => {
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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse from already-read rawBody
    const payload: AllocatePrizesRequest = JSON.parse(rawBody);
    const { tournamentId, overrides = [], ruleConfigOverride, dryRun = false, tieBreakStrategy } = payload;

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: tournamentAccess, error: tournamentAccessError } = await supabaseClient
      .from('tournaments')
      .select('id, owner_id')
      .eq('id', tournamentId)
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

    const { data: isMaster, error: roleError } = await supabaseClient
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

    const genderDebugEnabled = tournamentId === GENDER_DEBUG_TOURNAMENT_ID;

    // TEMP: gender debug logging for tournament 74e1bd2b-0b3b-4cd6-abfc-30a6a7c2bf15
    const logGenderEligibility = (
      category: CategoryRow,
      player: { name?: string | null; gender?: string | null },
      evaluation: EligibilityResult
    ) => {
      if (!genderDebugEnabled) return;

      const requiredGender = category.criteria_json?.gender?.toUpperCase?.();
      if (!requiredGender || requiredGender === 'OPEN') return;

      const failReason = evaluation.reasonCodes.find(code => code.startsWith('gender_')) ?? null;
      const passedGenderCheck = evaluation.passCodes.includes('gender_ok');

      console.log(
        `[alloc.gender-debug] ${JSON.stringify({
          category_name: category.name,
          player_name: player.name ?? null,
          player_gender: player.gender ?? null,
          passed_gender_check: passedGenderCheck,
          fail_reason: failReason
        })}`
      );
    };

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
    // NOTE: category_type is stored in criteria_json.category_type until DB migration adds the column
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
    // category_type: check both top-level (future) and criteria_json.category_type (current fallback)
    const activeCategories = (categories || [])
      .filter(c => c.is_active !== false)
      .map(c => {
        const crit = c.criteria_json as CriteriaJson | undefined;
        const catType = crit?.category_type ?? 'standard';
        return {
          ...c,
          criteria_json: crit,
          category_type: catType,
          prizes: (c.prizes || []).filter((p: PrizeRow) => p.is_active !== false) as PrizeRow[]
        };
      }) as CategoryRow[];

    const activePrizes = activeCategories.flatMap(cat => cat.prizes || []);

    // 3) Fetch players with FULL projection for allocation
    const REQUIRED_COLUMNS = [
      'id', 'rank', 'name', 'rating', 'dob', 'gender', 
      'state', 'city', 'club', 'fide_id', 'disability', 'unrated',
      'federation', 'sno', 'group_label', 'type_label'
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
    const playerRows = players as unknown as PlayerRow[];

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
    const coerceBool = (value: unknown, fallback: boolean) => {
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
      prefer_main_on_equal_value: true,
      main_vs_side_priority_mode: 'place_first' as MainVsSidePriorityMode,
      tie_break_strategy: 'rating_then_name' as TieBreakStrategy,
      verbose_logs: envVerbose,
      // NEW: Age band policy - 'non_overlapping' (default) or 'overlapping'
      age_band_policy: 'non_overlapping' as 'non_overlapping' | 'overlapping',
      // NEW: Per-player prize cap policy (defaults to legacy single-prize behaviour)
      multi_prize_policy: 'single' as MultiPrizePolicy,
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
    const multiPrizePolicy: MultiPrizePolicy = (rules.multi_prize_policy ?? 'single') as MultiPrizePolicy;
    rules.multi_prize_policy = multiPrizePolicy;
    const ruleOverride = ruleConfigOverride as Record<string, unknown> | undefined;
    const mainVsSidePriorityMode = ((ruleOverride?.main_vs_side_priority_mode ??
      ruleConfig?.main_vs_side_priority_mode ??
      (rules.prefer_main_on_equal_value ? 'main_first' : 'place_first')) as MainVsSidePriorityMode);
    rules.main_vs_side_priority_mode = mainVsSidePriorityMode;

    // Determine age band policy
    const ageBandPolicy = (rules.age_band_policy ?? 'non_overlapping') as 'non_overlapping' | 'overlapping';
    console.log(`[alloc] tid=${tournamentId} players=${playerRows.length} categories=${activeCategories.length} prizes=${activePrizes.length} ageBandPolicy=${ageBandPolicy}`);

    // 4.5) Compute effective age bands for non-overlapping policy
    // This transforms overlapping Under-X categories into disjoint age bands
    // EffectiveAgeBand type is defined near evaluateEligibility at module level
    const effectiveAgeBands = new Map<string, { category_id: string; effective_min_age: number; effective_max_age: number }>();

    if (ageBandPolicy === 'non_overlapping') {
      // Find all categories with max_age defined (typical Under-X categories)
      type AgeCatInfo = { id: string; name: string; max_age: number; min_age: number | null };
      
      const ageCats: AgeCatInfo[] = activeCategories
        .filter(c => c.criteria_json?.max_age != null)
        .map(c => ({
          id: c.id,
          name: c.name,
          max_age: Number(c.criteria_json!.max_age),
          min_age: c.criteria_json!.min_age != null ? Number(c.criteria_json!.min_age) : null,
        }));

      // FIX: Group categories by max_age so that Boy/Girl pairs sharing same max_age get same band
      // e.g., U08 Boy + U08 Girl both have max_age=8 → both get [0, 8]
      // Previously, iterating one-by-one caused the second category to get [9, 8] which is invalid
      const groupsByMaxAge = new Map<number, AgeCatInfo[]>();
      for (const cat of ageCats) {
        const group = groupsByMaxAge.get(cat.max_age) ?? [];
        group.push(cat);
        groupsByMaxAge.set(cat.max_age, group);
      }

      // Sort groups by max_age ascending
      const sortedMaxAges = Array.from(groupsByMaxAge.keys()).sort((a, b) => a - b);

      // Derive disjoint bands per group: U8=[0,8], U11=[9,11], U14=[12,14], U17=[15,17]
      // All categories in the same group (same max_age) share the same effective band
      let prevMaxAge = -1;
      for (const groupMaxAge of sortedMaxAges) {
        const group = groupsByMaxAge.get(groupMaxAge)!;
        const derivedMinAge = prevMaxAge + 1;

        // Collect explicit min_age values from group members (if any)
        const explicitMins = group
          .map(c => c.min_age)
          .filter((m): m is number => m != null);

        // If any category in the group has explicit min_age, use the smallest but respect derived min
        const candidateMin = explicitMins.length > 0
          ? Math.max(derivedMinAge, Math.min(...explicitMins))
          : derivedMinAge;

        // Guard against invalid ranges: never let effective_min_age exceed effective_max_age
        const effectiveMin = Math.min(candidateMin, groupMaxAge);
        if (candidateMin > groupMaxAge) {
          console.warn('[alloc.ageBands] clamped effective_min_age to avoid inverted band', {
            groupMaxAge,
            derivedMinAge,
            candidateMin,
          });
        }

        // Assign the same band to ALL categories in this group
        for (const cat of group) {
          effectiveAgeBands.set(cat.id, {
            category_id: cat.id,
            effective_min_age: effectiveMin,
            effective_max_age: groupMaxAge,
          });
        }

        prevMaxAge = groupMaxAge;
      }

      if (effectiveAgeBands.size > 0) {
        console.log(`[alloc.ageBands] non_overlapping mode: derived ${effectiveAgeBands.size} disjoint bands from ${sortedMaxAges.length} age groups`);
        for (const [catId, band] of effectiveAgeBands) {
          const catName = activeCategories.find(c => c.id === catId)?.name ?? catId;
          console.log(`[alloc.ageBands]   ${catName}: age ${band.effective_min_age}-${band.effective_max_age}`);
        }
      }
    } else {
      console.log(`[alloc.ageBands] overlapping mode: using raw min_age/max_age from criteria`);
    }

    // Pre-flight field coverage check
    if (playerRows.length > 0) {
      const sample = playerRows[0] as Record<string, unknown>;
      const criticalFields = ['id', 'rank', 'dob', 'gender', 'rating'];
      const missingCritical = criticalFields.filter(f => sample[f] === undefined);
      
      if (missingCritical.length > 0) {
        console.error(`[alloc.preflight] CRITICAL: Missing essential player fields: ${missingCritical.join(', ')}. Allocation will likely fail.`);
      }
      
      // Count how many players have each important field populated
      const fieldCoverage: Record<string, number> = {};
      const fieldsToCheck = ['dob', 'gender', 'rating', 'state', 'city', 'club', 'disability', 'fide_id'];
      
      for (const field of fieldsToCheck) {
        fieldCoverage[field] = playerRows.filter((p) => (p as Record<string, unknown>)[field] != null && (p as Record<string, unknown>)[field] !== '').length;
      }
      
      console.log(`[alloc.preflight] Field coverage (non-null):`, fieldCoverage);
    }

    // 5) Build prize queue sorted GLOBALLY by cash amount first (max-cash-per-player semantics)
    const prizeQueue = activeCategories.flatMap(cat => 
      cat.prizes.map(p => ({ cat, p }))
    );

    // Use main_vs_side_priority_mode from rules to determine priority behavior
    const prizeComparator = makePrizeComparator({
      main_vs_side_priority_mode: rules.main_vs_side_priority_mode ?? 'place_first'
    });
    prizeQueue.sort(prizeComparator);

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
    const assignments = new Map<string, AssignedPrizeInfo[]>();
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
    const playerLookup = new Map<string, (typeof playerRows)[number]>(
      playerRows.map(p => [p.id, p])
    );

    for (const override of overrides) {
      const prizeContext = prizeLookup.get(override.prizeId);
      const player = playerLookup.get(override.playerId);
      const force = override.force === true;

      const evaluation = (prizeContext && player)
        ? evaluateEligibility(player, prizeContext.cat, rules, tournamentStartDate, effectiveAgeBands)
        : null;
      const eligible = evaluation?.eligible === true;

      if (evaluation && prizeContext?.cat && player) {
        logGenderEligibility(prizeContext.cat, player, evaluation);
      }

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

      if (prizeContext?.cat && prizeContext?.p) {
        recordAssignment(assignments, override.playerId, { category: prizeContext.cat, prize: prizeContext.p });
      }
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

      const youngestCategory = isYoungestCategory(cat);

      // Track eligibility BEFORE prize-cap exclusion
      const eligibleBeforeOnePrize: Array<{ player: PlayerRow; passCodes: string[]; warnCodes: string[] }> = [];
      const eligible: Array<{ player: PlayerRow; passCodes: string[]; warnCodes: string[] }> = [];
      const failCodes = new Set<string>();

      for (const player of playerRows) {
        const evaluation = evaluateEligibility(player, cat, rules, tournamentStartDate, effectiveAgeBands);
        logGenderEligibility(cat, player, evaluation);
        if (rules.verbose_logs) {
          const status = evaluation.eligible ? 'eligible' : 'ineligible';
          const codes = evaluation.eligible
            ? [...evaluation.passCodes, ...evaluation.warnCodes]
            : evaluation.reasonCodes;
          console.log(`[alloc.check] prize=${p.id} player=${player.id} status=${status} codes=${codes.join(',') || 'none'}`);
        }
        if (evaluation.eligible) {
          eligibleBeforeOnePrize.push({ player, passCodes: evaluation.passCodes, warnCodes: evaluation.warnCodes });
          const canTakePrize = canPlayerTakePrize({
            policy: multiPrizePolicy,
            category: cat,
            playerId: player.id,
            assignments,
          });

          if (canTakePrize) {
            eligible.push({ player, passCodes: evaluation.passCodes, warnCodes: evaluation.warnCodes });
          }
        } else {
          evaluation.reasonCodes.forEach(code => failCodes.add(code));
        }
      }

      const candidatesBeforeOnePrize = eligibleBeforeOnePrize.length;
      const candidatesAfterOnePrize = eligible.length;
      const isBlockedByOnePrize = candidatesBeforeOnePrize > 0 && candidatesAfterOnePrize === 0;
      const rawFailCodes = Array.from(failCodes).sort();

      if (eligible.length === 0) {
        const reasonList = failCodes.size > 0 ? rawFailCodes : ['no_eligible_players'];
        
        // Detailed coverage diagnostic
        const categoryName = cat.name;
        const prizePlace = p.place;
        const totalPlayers = playerRows.length;
        const alreadyAssigned = assignments.size;
        const availablePool = totalPlayers - alreadyAssigned;
        
        console.log(`[allocation.coverage] category="${categoryName}" place=${prizePlace} eligible=0 picked=0 availablePool=${availablePool} reasons=${reasonList.join(',')}`);
        
        // Check if missing fields are the issue
        const fieldMissingReasons = reasonList.filter(r => 
          r.includes('missing') || r.includes('_excluded')
        );
        if (fieldMissingReasons.length > 0) {
          console.warn(`[allocation.coverage] "${categoryName}" place ${prizePlace} unfilled due to missing/excluded fields: ${fieldMissingReasons.join(', ')}`);
        }
        
        // Derive the reason code
        const reasonCode = deriveReasonCode(rawFailCodes, candidatesBeforeOnePrize, candidatesAfterOnePrize);
        
        // Build diagnosis summary for 0-candidate cases
        const diagnosisSummary = buildDiagnosisSummary(rawFailCodes, cat, candidatesBeforeOnePrize);
        
        // Track coverage with enriched data
        coverageData.push({
          // Legacy fields
          categoryId: cat.id,
          categoryName: cat.name,
          prizeId: p.id,
          place: p.place,
          eligibleCount: 0,
          pickedCount: 0,
          reasonCodes: reasonList,
          
          // Enhanced debug fields
          prize_id: p.id,
          category_id: cat.id,
          category_name: cat.name,
          prize_place: p.place,
          prize_label: buildPrizeLabel(cat, p),
          prize_type: derivePrizeType(p),
          amount: p.cash_amount,
          
          winner_player_id: null,
          winner_rank: null,
          winner_rating: null,
          winner_name: null,
          
          candidates_before_one_prize: candidatesBeforeOnePrize,
          candidates_after_one_prize: candidatesAfterOnePrize,
          reason_code: reasonCode,
          reason_details: isBlockedByOnePrize 
            ? `${candidatesBeforeOnePrize} player(s) eligible, but all already won higher-priority prizes` 
            : `No players match the criteria: ${reasonList.slice(0, 3).join(', ')}`,
          
          is_main: cat.is_main,
          is_category: !cat.is_main,
          is_unfilled: true,
          is_blocked_by_one_prize: isBlockedByOnePrize,
          raw_fail_codes: rawFailCodes,
          diagnosis_summary: diagnosisSummary,
          
          // Prize priority hierarchy
          priority_explanation: buildPriorityExplanation(cat, p, rules.main_vs_side_priority_mode),
          has_trophy: !!p.has_trophy,
          has_medal: !!p.has_medal
        });
        
        unfilled.push({ prizeId: p.id, reasonCodes: reasonList });
        console.log(`[alloc.unfilled] prize=${p.id} reason=${reasonList.join(',')}`);
        continue;
      }

      // Deterministic tie-breaking based on configured strategy
      if (youngestCategory) {
        eligible.sort(compareYoungestEligible);
      } else {
        eligible.sort((a, b) => compareEligibleByRankRatingName(a, b, tieBreakFields));
      }
      const winner = eligible[0];

      // Compute tie-break reason for logging
      let tieBreak: 'none' | TieBreakField | 'rank' = 'none';
      let dobTiePlayers: string[] = [];
      if (eligible.length > 1) {
        if (youngestCategory) {
          const first = eligible[0].player;
          const second = eligible[1].player;
          const dobFirst = first.dob ? new Date(first.dob).getTime() : Number.NEGATIVE_INFINITY;
          const dobSecond = second.dob ? new Date(second.dob).getTime() : Number.NEGATIVE_INFINITY;
          if (dobFirst === dobSecond) {
            // Log all players with identical DOB for debugging
            dobTiePlayers = eligible
              .filter(e => {
                const d = e.player.dob ? new Date(e.player.dob).getTime() : Number.NEGATIVE_INFINITY;
                return d === dobFirst;
              })
              .map(e => `${e.player.name}(rank=${e.player.rank ?? '?'})`);
            
            if (dobTiePlayers.length > 1) {
              console.log(`[alloc.youngest.dob_tie] prize=${p.id} DOB tie among: ${dobTiePlayers.join(', ')}`);
            }
            
            // Tie-break order: rank → rating → name
            if ((first.rank ?? Number.MAX_SAFE_INTEGER) !== (second.rank ?? Number.MAX_SAFE_INTEGER)) {
              tieBreak = 'rank';
            } else if ((first.rating ?? 0) !== (second.rating ?? 0)) {
              tieBreak = 'rating';
            } else if ((first.name ?? '').toString() !== (second.name ?? '').toString()) {
              tieBreak = 'name';
            }
          }
        } else {
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
      }

      recordAssignment(assignments, winner.player.id, { category: cat, prize: p });
      const reasonSet = new Set<string>([
        'auto',
        youngestCategory ? 'youngest' : 'rank',
        'max_cash_priority',
        ...winner.passCodes,
        ...winner.warnCodes
      ]);
      const reasonList = Array.from(reasonSet);
      winners.push({
        prizeId: p.id,
        playerId: winner.player.id,
        reasons: reasonList,
        isManual: false
      });

      // Track coverage with enriched data
      coverageData.push({
        // Legacy fields
        categoryId: cat.id,
        categoryName: cat.name,
        prizeId: p.id,
        place: p.place,
        eligibleCount: eligible.length,
        pickedCount: 1,
        winnerId: winner.player.id,
        reasonCodes: reasonList,
        
        // Enhanced debug fields
        prize_id: p.id,
        category_id: cat.id,
        category_name: cat.name,
        prize_place: p.place,
        prize_label: buildPrizeLabel(cat, p),
        prize_type: derivePrizeType(p),
        amount: p.cash_amount,
        
        winner_player_id: winner.player.id,
        winner_rank: winner.player.rank ?? null,
        winner_rating: winner.player.rating ?? null,
        winner_name: winner.player.name ?? null,
        
        candidates_before_one_prize: candidatesBeforeOnePrize,
        candidates_after_one_prize: candidatesAfterOnePrize,
        reason_code: null,
        reason_details: null,
        
        is_main: cat.is_main,
        is_category: !cat.is_main,
        is_unfilled: false,
        is_blocked_by_one_prize: false,
        raw_fail_codes: [],
        diagnosis_summary: null,
        
        // Prize priority hierarchy
        priority_explanation: buildPriorityExplanation(cat, p, rules.main_vs_side_priority_mode),
        has_trophy: !!p.has_trophy,
        has_medal: !!p.has_medal
      });

      console.log(`[alloc.win] prize=${p.id} player=${winner.player.id} rank=${winner.player.rank} tie_break=${tieBreak} reasons=${reasonList.join(',')}`);
      console.log(`[allocation.coverage] category="${cat.name}" place=${p.place} eligible=${eligible.length} picked=1 winner=${winner.player.id}`);
    }

    // 7) Minimal conflict detection: only for identical prizeKey ties
    
    // Build eligibility map: player -> prizes they're eligible for
    const playerEligiblePrizes = new Map<string, Array<{ cat: CategoryRow; p: PrizeRow }>>();
    for (const { cat, p } of prizeQueue) {
      for (const player of playerRows) {
        const evaluation = evaluateEligibility(player, cat, rules, tournamentStartDate, effectiveAgeBands);
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
        coverage: coverageData, // Always return coverage for debug report
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

  } catch (e: unknown) {
    console.error('[allocatePrizes] fatal', e);
    const errMsg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: errMsg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

// ============= Helper Functions =============

export const normGender = (g?: string | null): string | null => {
  if (!g) return null;
  const s = String(g).trim().toLowerCase();
  if (['m', 'male', 'boy'].includes(s)) return 'M';
  if (['f', 'female', 'girl'].includes(s)) return 'F';
  return null;
};

const padTwo = (value: number): string => String(value).padStart(2, '0');

const parseIsoDateParts = (value: string | null | undefined): { year: number; month: number; day: number } | null => {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  return { year, month, day };
};

const toIsoDateString = (date: Date): string =>
  `${date.getUTCFullYear()}-${padTwo(date.getUTCMonth() + 1)}-${padTwo(date.getUTCDate())}`;

export const getAgeOnDate = (dobISO: string | null | undefined, asOfISO: string | null | undefined): number | null => {
  const dobParts = parseIsoDateParts(dobISO);
  const asOfParts = parseIsoDateParts(asOfISO);
  if (!dobParts || !asOfParts) return null;
  let age = asOfParts.year - dobParts.year;
  if (
    asOfParts.month < dobParts.month ||
    (asOfParts.month === dobParts.month && asOfParts.day < dobParts.day)
  ) {
    age -= 1;
  }
  return age;
};

export const yearsOn = (dobISO: string | null | undefined, onDate: Date): number | null => {
  return getAgeOnDate(dobISO, toIsoDateString(onDate));
};

// Detect rating category purely by presence of rating bounds
export const isRatingCategory = (criteria: CriteriaJson | undefined): boolean =>
  !!(criteria && (typeof criteria.min_rating === 'number' || typeof criteria.max_rating === 'number'));

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

const normalizeLocation = (raw: unknown, type?: LocationType): string => {
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

const normalizeAllowedList = (values: unknown[] | undefined, aliases: AliasSpec, type?: LocationType) => {
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

const matchesLocation = (value: unknown, values?: unknown[], aliases?: AliasSpec, type?: LocationType): boolean => {
  if (!Array.isArray(values) || values.length === 0) return true;

  const { allowedSet, aliasLookup } = normalizeAllowedList(values, aliases, type);
  const norm = normalizeLocation(value, type);
  if (!norm) return false;
  const canonical = aliasLookup.get(norm) ?? norm;
  return allowedSet.has(canonical);
};

// Effective age band type for non-overlapping mode
type EffectiveAgeBand = { category_id: string; effective_min_age: number; effective_max_age: number };

// Rules type for allocation config
type AllocationRules = {
  strict_age?: boolean;
  allow_missing_dob_for_age?: boolean;
  max_age_inclusive?: boolean;
  allow_unrated_in_rating?: boolean;
  verbose_logs?: boolean;
  multi_prize_policy?: MultiPrizePolicy;
  main_vs_side_priority_mode?: MainVsSidePriorityMode;
  tie_break_strategy?: TieBreakStrategy;
  tieBreakStrategy?: TieBreakStrategy;
  prefer_main_on_equal_value?: boolean;
  age_band_policy?: 'non_overlapping' | 'overlapping';
  [key: string]: unknown;
};

export const evaluateEligibility = (
  player: PlayerRow,
  cat: CategoryRow,
  rules: AllocationRules,
  onDate: Date,
  effectiveAgeBands?: Map<string, EffectiveAgeBand>
): EligibilityResult => {
  const c = (cat.criteria_json || {}) as CriteriaJson & { 
    allow_missing_dob_for_age?: boolean;
    max_age_inclusive?: boolean;
    include_unrated?: boolean;
    unrated_only?: boolean;
    city_aliases?: AliasSpec;
    state_aliases?: AliasSpec;
    club_aliases?: AliasSpec;
  };
  const categoryType = (cat.category_type as string) || 'standard';
  const isYoungest = categoryType === 'youngest_female' || categoryType === 'youngest_male';
  const failCodes = new Set<string>();
  const passCodes = new Set<string>();
  const warnCodes = new Set<string>();

  // Gender check
  // Unified logic: 'M' and 'M_OR_UNKNOWN' both mean "not F" (boys + unknown)
  // This ensures backwards compatibility with old configs using gender='M'
  const reqG = (() => {
    if (isYoungest) {
      return categoryType === 'youngest_female' ? 'F' : 'M_OR_UNKNOWN';
    }
    return c.gender?.toUpperCase?.() || null;
  })();
  const pg = normGender(player.gender);
  
  // Unified "boys" mode: both 'M' and 'M_OR_UNKNOWN' treat as "not F"
  const isBoysMode = reqG === 'M' || reqG === 'M_OR_UNKNOWN';
  
  if (isBoysMode) {
    // Boys mode: exclude explicit females, allow males and unknowns
    if (pg === 'F') {
      failCodes.add('gender_mismatch');
    } else {
      passCodes.add('gender_ok');
    }
  } else if (reqG === 'F') {
    // Girls only: require explicit F
    if (!pg) {
      failCodes.add('gender_missing');
    } else if (pg !== 'F') {
      failCodes.add('gender_mismatch');
    } else {
      passCodes.add('gender_ok');
    }
  } else {
    // Open/any gender
    passCodes.add('gender_open');
  }

  if (isYoungest && !player.dob) {
    failCodes.add('dob_missing');
  }

  // Age (strict ON by default)
  // If effectiveAgeBands is provided and this category has an entry, use the effective bounds
  const strict = rules?.strict_age !== false;
  const allowMissingDob = c.allow_missing_dob_for_age != null
    ? !!c.allow_missing_dob_for_age
    : !!rules?.allow_missing_dob_for_age;
  const maxAgeInclusive = c.max_age_inclusive != null
    ? !!c.max_age_inclusive
    : rules?.max_age_inclusive ?? true;
  const age = yearsOn(player.dob ?? null, onDate);

  // Determine the actual age bounds to use
  // Priority: effectiveAgeBands (non-overlapping) > criteria_json (raw)
  const effectiveBand = effectiveAgeBands?.get(cat.id);
  const effectiveMinAge = effectiveBand?.effective_min_age ?? (c.min_age != null ? Number(c.min_age) : null);
  const effectiveMaxAge = effectiveBand?.effective_max_age ?? (c.max_age != null ? Number(c.max_age) : null);
  
  const hasAgeRule = strict && (effectiveMaxAge != null || effectiveMinAge != null);
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
      if (effectiveMaxAge != null) {
        const exceeds = maxAgeInclusive ? age > effectiveMaxAge : age >= effectiveMaxAge;
        if (exceeds) {
          failCodes.add('age_above_max');
          ageOk = false;
        }
      }
      // NEW: Also check min_age (from effective bands for non-overlapping policy)
      if (effectiveMinAge != null && age < effectiveMinAge) {
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

  // A category is rating-aware if it has rating bounds OR is explicitly unrated-only
  const ratingCat = isRatingCategory(c) || unratedOnly;

  // Legacy flags used before we added per-category include_unrated
  const allowUnratedRule = !!rules?.allow_unrated_in_rating;
  const hasMinRating = typeof c.min_rating === 'number';
  const hasMaxRating = typeof c.max_rating === 'number';

  // Legacy: "max-only" bands historically allowed unrated players
  const allowUnratedByMaxOnly = hasMaxRating && !hasMinRating;

  // Legacy fallback when include_unrated was not present
  const legacyAllowUnrated = allowUnratedRule || allowUnratedByMaxOnly;

  // Explicit per-category behaviour
  const includeUnrated = c.include_unrated;

  // Truth table for allowUnrated:
  // - unrated_only = true => ignore min/max, rated blocked, unrated allowed
  // - include_unrated = true => allow unrated in rating categories
  // - include_unrated = false => block unrated in rating categories
  // - include_unrated unset => legacy: allow_unrated_in_rating OR (max-only band)
  let allowUnrated: boolean;
  if (unratedOnly) {
    // unrated_only always allows unrated (rated players are handled separately)
    allowUnrated = true;
  } else if (includeUnrated === true) {
    // Explicitly include unrated
    allowUnrated = true;
  } else if (includeUnrated === false) {
    // Explicitly exclude unrated
    allowUnrated = false;
  } else {
    // include_unrated unset → use legacy behaviour
    allowUnrated = legacyAllowUnrated;
  }

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
  const inList = (val: unknown, arr?: unknown[]) =>
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

  // Group filter (Gr column): case-insensitive, trimmed matching
  if (Array.isArray(c.allowed_groups) && c.allowed_groups.length > 0) {
    const playerGroup = (player.group_label ?? '').trim().toUpperCase();
    const allowedNormalized = c.allowed_groups.map((g: unknown) => String(g ?? '').trim().toUpperCase());
    
    if (!playerGroup || !allowedNormalized.includes(playerGroup)) {
      failCodes.add('group_excluded');
    } else {
      passCodes.add('group_ok');
    }
  }

  // Type filter (Swiss-Manager Type column): case-insensitive, trimmed matching
  if (Array.isArray(c.allowed_types) && c.allowed_types.length > 0) {
    const playerType = (player.type_label ?? '').trim().toUpperCase();
    const allowedTypes = c.allowed_types.map((t: unknown) => String(t ?? '').trim().toUpperCase());
    
    if (!playerType || !allowedTypes.includes(playerType)) {
      failCodes.add('type_excluded');
    } else {
      passCodes.add('type_ok');
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

/**
 * Prize type hierarchy score: higher = more prestigious
 * Trophy (3) > Medal (2) > Certificate/None (0)
 */
export const getPrizeTypeScore = (p: PrizeRow): number => {
  if (p.has_trophy) return 3;
  if (p.has_medal) return 2;
  return 0;
};

/**
 * Human-readable prize type label for debug output
 */
export const getPrizeTypeLabel = (p: PrizeRow): string => {
  if (p.has_trophy) return 'trophy';
  if (p.has_medal) return 'medal';
  return 'other';
};

/**
 * Computes a composite key for prize ranking.
 * 
 * PRIZE PRIORITY HIERARCHY (documented for debug output):
 * ─────────────────────────────────────────────────────────
 * 1. CASH AMOUNT (higher = better)
 *    - A ₹1000 prize always beats a ₹500 prize
 * 
 * 2. PRIZE TYPE when cash is equal (trophy > medal > none)
 *    - Trophy (+3) beats Medal (+2) beats Certificate/None (+0)
 * 
 * 3. PLACE NUMBER (1st > 2nd > 3rd) - BEFORE main!
 *    - When cash + trophy/medal are equal, player prefers the prize
 *      where their placing is better, regardless of Main vs Subcategory.
 *    - Example: Rating 1st (₹8.5k, trophy) beats Main 8th (₹8.5k, trophy)
 * 
 * 4. MAIN CATEGORY when cash+type+place equal
 *    - Main category prizes preferred over subcategory prizes
 * 
 * 5. CATEGORY ORDER (brochure order, lower = earlier = better)
 *    - Categories listed first in brochure take precedence
 * 
 * 6. PRIZE ID (stable tie-breaker for determinism)
 */
export const prizeKey = (cat: CategoryRow, p: PrizeRow) => {
  const cash = p.cash_amount ?? 0;
  const prizeTypeScore = getPrizeTypeScore(p);
  
  return {
    cash,                                      // 1. Cash amount DESC
    prizeTypeScore,                            // 2. Prize type DESC (trophy > medal > none)
    place: p.place ?? 9999,                    // 3. Place ASC (1st > 2nd > 3rd) - BEFORE main!
    main: cat.is_main ? 1 : 0,                 // 4. Main category DESC
    order: cat.order_idx ?? 0,                 // 5. Category order ASC
    pid: p.id                                  // 6. Stable tie-breaker
  };
};

/**
 * Factory to create a prize comparator with configurable priority rules.
 * 
 * When main_vs_side_priority_mode = 'main_first' and comparing Main vs Side:
 *   cash → type → MAIN FIRST → place → brochure order → id
 * 
 * When main_vs_side_priority_mode = 'place_first' or comparing Side vs Side:
 *   cash → type → place → main → brochure order → id
 * 
 * This allows tournaments to choose whether Main prizes always beat Side prizes
 * (when cash/type are equal), or whether a better place in Side beats a worse
 * place in Main.
 */
export const makePrizeComparator = (opts: { main_vs_side_priority_mode?: MainVsSidePriorityMode } = {}) => {
  const preferMainFirst = opts.main_vs_side_priority_mode === 'main_first';
  
  return (a: { cat: CategoryRow; p: PrizeRow }, b: { cat: CategoryRow; p: PrizeRow }): number => {
    const ak = prizeKey(a.cat, a.p), bk = prizeKey(b.cat, b.p);

    // 1. Cash amount: higher wins
    if (ak.cash !== bk.cash) return bk.cash - ak.cash;

    // 2. Prize type: trophy > medal > none
    if (ak.prizeTypeScore !== bk.prizeTypeScore) return bk.prizeTypeScore - ak.prizeTypeScore;

    // 3. Conditional: If preferMainFirst AND comparing Main vs Side, Main wins here
    //    This ONLY applies when one is Main and one is Side (mixed comparison)
    //    Side vs Side still uses place before main (step 4 below)
    const isMainVsSide = ak.main !== bk.main;
    if (preferMainFirst && isMainVsSide) {
      return bk.main - ak.main; // Main wins over Side
    }

    // 4. Place number: 1st > 2nd > 3rd (lower place = higher priority)
    if (ak.place !== bk.place) return ak.place - bk.place;
    
    // 5. Main category preferred (when cash, type, AND place are equal)
    //    This is a fallback for same-place comparison (only reached if places are equal)
    if (ak.main !== bk.main) return bk.main - ak.main;
    
    // 6. Category brochure order
    if (ak.order !== bk.order) return ak.order - bk.order;
    
    // 7. Stable tie-breaker by prize ID
    return String(ak.pid).localeCompare(String(bk.pid));
  };
};

/**
 * Default comparator for prize priority queue (main_vs_side_priority_mode = 'place_first').
 * 
 * Priority: cash → trophy/medal → place → main vs sub → brochure order → prize id
 * 
 * This is the legacy behavior where place beats main (Side 1st beats Main 4th).
 * Exported for backward-compatible tests.
 */
export const cmpPrize = makePrizeComparator({ main_vs_side_priority_mode: 'place_first' });

/**
 * Deterministic comparator for eligible players (standard categories).
 * 
 * INVARIANT: For any prize in a standard category, the winner MUST be the
 * best-ranked (lowest rank number) eligible player who hasn't already won a prize.
 * No unassigned player with a better rank should ever be skipped.
 * 
 * Sort order: rank ASC → configurable tie-breaks (rating DESC, name ASC)
 * Exported for testing.
 * 
 * Priority order for standard categories:
 * 1. Main tournament rank (ascending - lower = better)
 * 2. Rating (descending - higher = better, for ties)
 * 3. Name (alphabetical, for final stability)
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

export const getCategoryType = (category: { category_type?: string | null }): string =>
  category.category_type || 'standard';

export const isYoungestCategory = (category: { category_type?: string | null }): boolean => {
  const type = getCategoryType(category);
  return type === 'youngest_female' || type === 'youngest_male';
};

/**
 * Deterministic comparator for eligible players (youngest categories).
 * 
 * INVARIANT: For youngest categories, the winner MUST be the youngest
 * (most recent DOB) eligible player who hasn't already won a prize.
 * Ties broken by: rank → rating → name.
 * 
 * Priority order for youngest categories:
 * 1. DOB (descending - most recent = youngest = best)
 * 2. Main tournament rank (ascending - lower = better, for DOB ties)
 * 3. Rating (descending - higher = better)
 * 4. Name (alphabetical, for final stability)
 */
export function compareYoungestEligible(
  a: { player: { dob?: string | null; rank?: number | null; rating?: number | null; name?: string | null } },
  b: { player: { dob?: string | null; rank?: number | null; rating?: number | null; name?: string | null } },
): number {
  // Primary: youngest first (most recent DOB = larger timestamp = sorted first)
  const dobA = a.player.dob ? new Date(a.player.dob).getTime() : Number.NEGATIVE_INFINITY;
  const dobB = b.player.dob ? new Date(b.player.dob).getTime() : Number.NEGATIVE_INFINITY;
  if (dobA !== dobB) return dobB - dobA;

  // Secondary: tournament rank (lower = better, same as standard categories)
  const rankA = a.player.rank ?? Number.MAX_SAFE_INTEGER;
  const rankB = b.player.rank ?? Number.MAX_SAFE_INTEGER;
  if (rankA !== rankB) return rankA - rankB;

  // Tertiary: rating descending (higher = better) as final tie-breaker
  const ratingA = a.player.rating ?? 0;
  const ratingB = b.player.rating ?? 0;
  if (ratingA !== ratingB) return ratingB - ratingA;

  // Final: name alphabetically for stability
  const nameA = (a.player.name ?? '').toString();
  const nameB = (b.player.name ?? '').toString();
  return nameA.localeCompare(nameB);
}
