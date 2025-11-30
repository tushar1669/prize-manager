/**
 * Allocation types shared between frontend and Edge Function.
 * Used for the Allocation Debug Report feature.
 */

// Reason codes enum for unfilled prizes
export type UnfilledReasonCode =
  | 'NO_ELIGIBLE_PLAYERS'
  | 'BLOCKED_BY_ONE_PRIZE_POLICY'
  | 'TOO_STRICT_CRITERIA_RATING'
  | 'TOO_STRICT_CRITERIA_AGE'
  | 'TOO_STRICT_CRITERIA_GENDER'
  | 'TOO_STRICT_CRITERIA_LOCATION'
  | 'TOO_STRICT_CRITERIA_TYPE_OR_GROUP'
  | 'CATEGORY_INACTIVE'
  | 'INTERNAL_ERROR';

/**
 * Enriched allocation coverage entry for debug reporting.
 * Includes both legacy fields (camelCase) for backward compat and new fields (snake_case).
 */
export interface AllocationCoverageEntry {
  // Legacy fields (camelCase) - used by existing coverage table
  categoryId: string;
  categoryName: string;
  prizeId: string;
  place: number;
  eligibleCount: number;
  pickedCount: number;
  winnerId?: string;
  reasonCodes: string[];
  
  // New fields (snake_case) - used by debug report
  prize_id: string;
  category_id: string | null;
  category_name: string;
  prize_place: number;
  prize_label: string; // e.g., "1st U15 Boys"
  prize_type: 'cash' | 'trophy' | 'medal' | 'other';
  amount: number | null;

  winner_player_id: string | null;
  winner_rank: number | null;
  winner_rating: number | null;
  winner_name: string | null;

  // Debug stats for that prize
  candidates_before_one_prize: number; // eligible before enforcing "one player, one prize"
  candidates_after_one_prize: number; // eligible after excluding already-awarded players
  reason_code: UnfilledReasonCode | null; // top reason for failure if no winner
  reason_details: string | null; // human-readable

  // Optional flags for front-end UX
  is_main: boolean;
  is_category: boolean;
  is_unfilled: boolean;
  is_blocked_by_one_prize: boolean;

  // Raw failure codes from evaluateEligibility
  raw_fail_codes: string[];
  
  // Diagnosis summary for 0-candidate categories (Task 4)
  diagnosis_summary?: string | null;
}

/**
 * Category summary for the debug report.
 */
export interface CategorySummary {
  category_id: string;
  category_name: string;
  is_main: boolean;
  order_idx: number;
  total_prizes: number;
  filled_prizes: number;
  unfilled_prizes: number;
  coverage_entries: AllocationCoverageEntry[];
}

/**
 * Allocation debug report data.
 */
export interface AllocationDebugReport {
  tournament_id: string;
  total_players: number;
  total_prizes: number;
  total_winners: number;
  total_unfilled: number;
  coverage: AllocationCoverageEntry[];
  categories: CategorySummary[];
  suspicious_entries: AllocationCoverageEntry[];
}

/**
 * Helper to derive the top-level reason code from raw fail codes.
 */
export function deriveReasonCode(
  rawFailCodes: string[],
  candidatesBeforeOnePrize: number,
  candidatesAfterOnePrize: number
): UnfilledReasonCode {
  if (candidatesBeforeOnePrize > 0 && candidatesAfterOnePrize === 0) {
    return 'BLOCKED_BY_ONE_PRIZE_POLICY';
  }

  if (candidatesBeforeOnePrize === 0) {
    // Analyze fail codes to determine the strictest criteria
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

  return 'INTERNAL_ERROR';
}

/**
 * Human-readable labels for reason codes.
 */
export const reasonCodeToLabel: Record<UnfilledReasonCode, string> = {
  NO_ELIGIBLE_PLAYERS: 'No eligible winner (no players match criteria)',
  BLOCKED_BY_ONE_PRIZE_POLICY: 'No eligible winner (blocked by one-prize policy)',
  TOO_STRICT_CRITERIA_RATING: 'No eligible winner (rating criteria)',
  TOO_STRICT_CRITERIA_AGE: 'No eligible winner (age criteria)',
  TOO_STRICT_CRITERIA_GENDER: 'No eligible winner (gender criteria)',
  TOO_STRICT_CRITERIA_LOCATION: 'No eligible winner (location criteria)',
  TOO_STRICT_CRITERIA_TYPE_OR_GROUP: 'No eligible winner (type/group criteria)',
  CATEGORY_INACTIVE: 'Category is inactive',
  INTERNAL_ERROR: 'Internal error',
};

/**
 * Get human-readable label for a reason code.
 */
export function getReasonLabel(code: UnfilledReasonCode | null): string {
  if (!code) return '';
  return reasonCodeToLabel[code] || code;
}
