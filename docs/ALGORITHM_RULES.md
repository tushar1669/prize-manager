# Allocation Algorithm Rules (repo-grounded)

> Every rule below includes a one-sentence summary, inputs, decision logic, where it lives, and where a user configures it (if applicable).

## Rule: Active category and prize selection
- **Rule in one sentence:** Only active categories and prizes are considered in allocation. (supabase/functions/allocatePrizes/index.ts → Deno.serve)
- **Inputs:** `categories.is_active`, `prizes.is_active` for the tournament. (supabase/functions/allocatePrizes/index.ts → Deno.serve)
- **Decision logic:** `allocatePrizes` filters categories where `is_active !== false` and prizes where `is_active !== false` before building the prize queue. (supabase/functions/allocatePrizes/index.ts → Deno.serve)
- **Where it lives:** `activeCategories`/`activePrizes` computation in `allocatePrizes`. (supabase/functions/allocatePrizes/index.ts → Deno.serve)
- **Where user configures it:** Category toggle in `CategoryPrizesEditor` on the setup page (UI), which updates category active status. (src/components/prizes/CategoryPrizesEditor.tsx → CategoryPrizesEditor; src/pages/TournamentSetup.tsx → TournamentSetup)

## Rule: Prize priority ordering (global prize queue)
- **Rule in one sentence:** Prizes are globally ranked by cash amount, then prize type, then place, then main-vs-side, then category order, then prize id. (supabase/functions/allocatePrizes/index.ts → prizeKey, makePrizeComparator)
- **Inputs:** `prizes.cash_amount`, `prizes.has_trophy`, `prizes.has_medal`, `prizes.place`, `categories.is_main`, `categories.order_idx`, `prizes.id`. (supabase/functions/allocatePrizes/index.ts → prizeKey)
- **Decision logic:** `makePrizeComparator` sorts by cash (desc), prize type (trophy/medal/none), place (asc), main flag, category order, and id. (supabase/functions/allocatePrizes/index.ts → makePrizeComparator, prizeKey)
- **Where it lives:** `prizeKey`, `getPrizeTypeScore`, `makePrizeComparator`. (supabase/functions/allocatePrizes/index.ts → prizeKey, getPrizeTypeScore, makePrizeComparator)
- **Where user configures it:** `main_vs_side_priority_mode` can shift where main-vs-side is applied (Settings page). (src/pages/Settings.tsx → Settings; supabase/functions/allocatePrizes/index.ts → makePrizeComparator)

## Rule: Main vs non-main priority mode
- **Rule in one sentence:** When cash/type are equal, tournaments can choose whether main prizes always outrank side prizes or whether place outranks main/side. (supabase/functions/allocatePrizes/index.ts → makePrizeComparator)
- **Inputs:** `rule_config.main_vs_side_priority_mode` (or `prefer_main_on_equal_value` fallback), and `categories.is_main`. (supabase/functions/allocatePrizes/index.ts → Deno.serve, makePrizeComparator)
- **Decision logic:** `makePrizeComparator` uses `main_first` to apply main-vs-side before place; `place_first` applies place before main. (supabase/functions/allocatePrizes/index.ts → makePrizeComparator)
- **Where it lives:** `makePrizeComparator` and `rules.main_vs_side_priority_mode`. (supabase/functions/allocatePrizes/index.ts → makePrizeComparator, Deno.serve)
- **Where user configures it:** Tournament Settings → `main_vs_side_priority_mode`. (src/pages/Settings.tsx → Settings; src/lib/validations.ts → ruleConfigSchema)

## Rule: Single vs multi-prize policy
- **Rule in one sentence:** Allocation can enforce one prize per player, allow one main + one side, or allow unlimited prizes. (supabase/functions/allocatePrizes/index.ts → canPlayerTakePrize)
- **Inputs:** `rule_config.multi_prize_policy`, prize category `is_main`, and existing assignments per player. (supabase/functions/allocatePrizes/index.ts → canPlayerTakePrize)
- **Decision logic:** `canPlayerTakePrize` blocks or allows prizes based on policy (`single`, `main_plus_one_side`, `unlimited`). (supabase/functions/allocatePrizes/index.ts → canPlayerTakePrize)
- **Where it lives:** `canPlayerTakePrize` and `rules.multi_prize_policy`. (supabase/functions/allocatePrizes/index.ts → canPlayerTakePrize, Deno.serve)
- **Where user configures it:** Tournament Settings → `multi_prize_policy`. (src/pages/Settings.tsx → Settings; src/lib/validations.ts → ruleConfigSchema)

## Rule: Standard category winner selection (rank-first)
- **Rule in one sentence:** For standard categories, the best-ranked eligible player wins, with tie-breaks by rating and name. (supabase/functions/allocatePrizes/index.ts → compareEligibleByRankRatingName)
- **Inputs:** `players.rank`, `players.rating`, `players.name`, `rules.tie_break_strategy`. (supabase/functions/allocatePrizes/index.ts → compareEligibleByRankRatingName, normalizeTieBreakStrategy)
- **Decision logic:** Sort by rank ascending, then configured tie-break fields (`rating`, then `name` by default). (supabase/functions/allocatePrizes/index.ts → compareEligibleByRankRatingName, normalizeTieBreakStrategy)
- **Where it lives:** `compareEligibleByRankRatingName` and `normalizeTieBreakStrategy`. (supabase/functions/allocatePrizes/index.ts → compareEligibleByRankRatingName, normalizeTieBreakStrategy)
- **Where user configures it:** API override via `tieBreakStrategy` in `allocatePrizes` request; UI configuration NOT FOUND IN REPO. (supabase/functions/allocatePrizes/index.ts → AllocatePrizesRequest)

## Rule: Youngest category winner selection
- **Rule in one sentence:** Youngest categories select the youngest eligible player by DOB, then break ties by rank, rating, and name. (supabase/functions/allocatePrizes/index.ts → compareYoungestEligible)
- **Inputs:** `players.dob`, `players.rank`, `players.rating`, `players.name`, `category_type`. (supabase/functions/allocatePrizes/index.ts → compareYoungestEligible, isYoungestCategory)
- **Decision logic:** Sort by DOB (most recent), then rank, rating, name. (supabase/functions/allocatePrizes/index.ts → compareYoungestEligible)
- **Where it lives:** `compareYoungestEligible` and `isYoungestCategory`. (supabase/functions/allocatePrizes/index.ts → compareYoungestEligible, isYoungestCategory)
- **Where user configures it:** Category type set to `youngest_female` or `youngest_male` in criteria sheet. (src/pages/TournamentSetup.tsx → TournamentSetup; supabase/functions/allocatePrizes/index.ts → isYoungestCategory)

## Rule: Gender eligibility
- **Rule in one sentence:** Categories can restrict eligibility to female-only, boys-only (not F), or open, based on `criteria_json.gender` and category type. (supabase/functions/allocatePrizes/index.ts → evaluateEligibility)
- **Inputs:** `criteria_json.gender`, `category_type`, `players.gender`. (supabase/functions/allocatePrizes/index.ts → evaluateEligibility, normGender)
- **Decision logic:** `evaluateEligibility` interprets `F` as female-only and `M`/`M_OR_UNKNOWN` as "not F". (supabase/functions/allocatePrizes/index.ts → evaluateEligibility)
- **Where it lives:** `evaluateEligibility`, `normGender`. (supabase/functions/allocatePrizes/index.ts → evaluateEligibility, normGender)
- **Where user configures it:** Category criteria sheet (`criteria_json.gender`) in Tournament Setup. (src/pages/TournamentSetup.tsx → TournamentSetup)

## Rule: Age eligibility (including age bands)
- **Rule in one sentence:** Age eligibility is enforced using `min_age`/`max_age` bounds, optionally transformed into non-overlapping bands. (supabase/functions/allocatePrizes/index.ts → evaluateEligibility, Deno.serve)
- **Inputs:** `criteria_json.min_age`, `criteria_json.max_age`, `rules.strict_age`, `rules.allow_missing_dob_for_age`, `rules.max_age_inclusive`, `rules.age_band_policy`, `players.dob`, `tournament.start_date`. (supabase/functions/allocatePrizes/index.ts → evaluateEligibility, Deno.serve)
- **Decision logic:** If `age_band_policy=non_overlapping`, `allocatePrizes` derives disjoint bands for categories sharing max age; eligibility uses effective min/max bounds with optional DOB-missing handling. (supabase/functions/allocatePrizes/index.ts → Deno.serve, evaluateEligibility)
- **Where it lives:** age band derivation in `allocatePrizes`, eligibility checks in `evaluateEligibility`. (supabase/functions/allocatePrizes/index.ts → Deno.serve, evaluateEligibility)
- **Where user configures it:** Settings page (`age_band_policy`, `allow_missing_dob_for_age`, `max_age_inclusive`, `strict_age`) and category criteria (`min_age`, `max_age`). (src/pages/Settings.tsx → Settings; src/pages/TournamentSetup.tsx → TournamentSetup)

## Rule: Rating eligibility (min/max + unrated handling)
- **Rule in one sentence:** Rating categories can enforce min/max ratings and control whether unrated players are allowed or excluded. (supabase/functions/allocatePrizes/index.ts → evaluateEligibility)
- **Inputs:** `criteria_json.min_rating`, `criteria_json.max_rating`, `criteria_json.unrated_only`, `criteria_json.include_unrated`, `rules.allow_unrated_in_rating`, `players.rating`, `players.unrated`. (supabase/functions/allocatePrizes/index.ts → evaluateEligibility)
- **Decision logic:** `evaluateEligibility` handles unrated-only categories, explicit include/exclude of unrated players, and min/max rating checks for rated players. (supabase/functions/allocatePrizes/index.ts → evaluateEligibility)
- **Where it lives:** `evaluateEligibility`. (supabase/functions/allocatePrizes/index.ts → evaluateEligibility)
- **Where user configures it:** Category criteria sheet (`min_rating`, `max_rating`, `include_unrated`, `unrated_only`) and Settings (`allow_unrated_in_rating`). (src/pages/TournamentSetup.tsx → TournamentSetup; src/pages/Settings.tsx → Settings)

## Rule: Location, group, type, and disability filters
- **Rule in one sentence:** Categories can restrict eligibility by state, city, club, group label, type label, or disability list. (supabase/functions/allocatePrizes/index.ts → evaluateEligibility)
- **Inputs:** `criteria_json.allowed_states`, `allowed_cities`, `allowed_clubs`, `allowed_groups`, `allowed_types`, `allowed_disabilities`, and player fields. (supabase/functions/allocatePrizes/index.ts → evaluateEligibility)
- **Decision logic:** `evaluateEligibility` checks membership in allowed lists with alias normalization for location fields and case-insensitive matching for group/type. (supabase/functions/allocatePrizes/index.ts → evaluateEligibility, matchesLocation)
- **Where it lives:** `evaluateEligibility`, `matchesLocation`, `normalizeAllowedList`. (supabase/functions/allocatePrizes/index.ts → evaluateEligibility, matchesLocation)
- **Where user configures it:** Category criteria sheet in Tournament Setup (state/city/club/group/type/disability inputs). (src/pages/TournamentSetup.tsx → TournamentSetup)

## Rule: Conflict detection for identical prize priority
- **Rule in one sentence:** If a player is eligible for multiple prizes with identical priority keys, a tie conflict is generated. (supabase/functions/allocatePrizes/index.ts → Deno.serve)
- **Inputs:** `prizeKey` values per eligible prize. (supabase/functions/allocatePrizes/index.ts → prizeKey, Deno.serve)
- **Decision logic:** `allocatePrizes` groups eligible prizes by `prizeKey` and emits conflicts when a group has 2+ prizes. (supabase/functions/allocatePrizes/index.ts → Deno.serve)
- **Where it lives:** conflict detection in `allocatePrizes`. (supabase/functions/allocatePrizes/index.ts → Deno.serve)
- **Where user configures it:** NOT FOUND IN REPO (no UI or config to change conflict detection). 

## Rule: Team/Institution prize allocation
- **Rule in one sentence:** Team prizes group players by institution field, score top-K players by rank points, and apply tie-breaks on team totals. (supabase/functions/allocateInstitutionPrizes/index.ts → Deno.serve)
- **Inputs:** `institution_prize_groups.group_by`, `team_size`, `female_slots`, `male_slots`, players’ `club/city/state/group_label/type_label`, and `rank`. (supabase/functions/allocateInstitutionPrizes/index.ts → GROUP_BY_COLUMN_MAP, buildTeam, getRankPoints)
- **Decision logic:** Build teams that satisfy gender slot requirements, compute total points via `(max_rank + 1 - rank)`, and rank institutions by total_points, rank_sum, best_individual_rank, then name. (supabase/functions/allocateInstitutionPrizes/index.ts → buildTeam, getRankPoints, compareInstitutions)
- **Where it lives:** `allocateInstitutionPrizes` edge function. (supabase/functions/allocateInstitutionPrizes/index.ts → Deno.serve)
- **Where user configures it:** Team prize rules in `TeamPrizeRulesSheet` (group_by, team_size, female_slots, male_slots, scoring_mode). (src/components/team-prizes/TeamPrizeRulesSheet.tsx → TeamPrizeRulesSheet; src/components/team-prizes/types.ts → GROUP_BY_OPTIONS)

## Rule: Import conflict detection (pre-dedup)
- **Rule in one sentence:** Import conflicts are detected by FIDE ID, Name+DOB, or SNo collisions, with rank-only ties ignored. (src/utils/conflictUtils.ts → detectConflictsInDraft, isRankOnlyCollision)
- **Inputs:** incoming row fields `fide_id`, `name`, `dob`, `dob_raw`, `sno`, `rank`. (src/utils/conflictUtils.ts → buildFideKey, buildNameDobKey, buildSnoKey)
- **Decision logic:** `detectConflictsInDraft` checks FIDE first, then Name+DOB (skipping when FIDE IDs differ), then SNo. (src/utils/conflictUtils.ts → detectConflictsInDraft, shouldGroupAsNameDobConflict)
- **Where it lives:** `conflictUtils`. (src/utils/conflictUtils.ts → detectConflictsInDraft)
- **Where user configures it:** NOT FOUND IN REPO (conflict detection rules are fixed). 

## Rule: Import dedup scoring + merge policy
- **Rule in one sentence:** Dedup scoring combines name, FIDE ID, DOB, and rating similarity; merge policy fills blanks and optionally prefers newer ratings or preserves DOB. (src/utils/dedup.ts → scoreCandidate, applyMergePolicy)
- **Inputs:** incoming player fields (`name`, `fide_id`, `dob`, `dob_raw`, `rating`) and existing player fields. (src/utils/dedup.ts → scoreCandidate, applyMergePolicy)
- **Decision logic:** `scoreCandidate` assigns weighted scores (name=0.45, FIDE=0.4, DOB=0.25, rating diff bonuses) and caps at 1.0; `applyMergePolicy` decides which fields to update based on policy flags. (src/utils/dedup.ts → scoreCandidate, applyMergePolicy)
- **Where it lives:** `dedup.ts`. (src/utils/dedup.ts → scoreCandidate, applyMergePolicy)
- **Where user configures it:** Default merge policy is set by feature flags; UI override NOT FOUND IN REPO. (src/utils/featureFlags.ts → IMPORT_MERGE_POLICY_DEFAULTS)
