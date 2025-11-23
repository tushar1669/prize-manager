/**
 * Shared utility for mapping reason codes to human-readable labels.
 * Used by allocation preview, conflict review, and unfilled prizes panels.
 */

export const reasonCodeLabels: Record<string, string> = {
  // Auto allocation reasons
  auto: "Auto allocated",
  rank: "Rank priority",
  brochure_order: "Brochure order",
  value_tier: "Value tier",
  manual_override: "Manual override",
  suggested_resolution: "Accepted suggestion",
  
  // Eligibility - positive
  gender_ok: "Gender eligible",
  gender_open: "Open gender",
  age_ok: "Age eligible",
  rating_ok: "Rating eligible",
  rating_unrated_allowed: "Unrated allowed",
  disability_ok: "Disability eligible",
  city_ok: "City eligible",
  state_ok: "State eligible",
  club_ok: "Club eligible",
  
  // Eligibility - negative
  gender_missing: "Gender missing",
  gender_mismatch: "Gender requirements not met",
  dob_missing: "DOB missing",
  dob_missing_allowed: "DOB missing (allowed by rules)",
  age_above_max: "Above age limit",
  age_below_min: "Below age limit",
  age_out_of_range: "Age requirements not met",
  unrated_excluded: "Unrated not allowed",
  rating_below_min: "Rating below minimum",
  rating_above_max: "Rating above maximum",
  rating_out_of_range: "Rating requirements not met",
  disability_excluded: "Disability not eligible",
  disability_mismatch: "Disability / PC requirements not met",
  city_excluded: "City not eligible",
  state_excluded: "State not eligible",
  state_mismatch: "Location requirements not met",
  club_excluded: "Club not eligible",
  
  // Unfilled reasons
  no_eligible_players: "No eligible players found",
  already_won: "All eligible players already won prizes",
  
  // Generic mismatch fallbacks
  GENDER_MISMATCH: "Gender requirements not met",
  AGE_OUT_OF_RANGE: "Age requirements not met",
  RATING_OUT_OF_RANGE: "Rating requirements not met",
  STATE_MISMATCH: "Location requirements not met",
  DISABILITY_MISMATCH: "Disability / PC requirements not met",
  NO_ELIGIBLE_PLAYERS: "No eligible players found",
  ALREADY_WON: "All eligible players already won prizes",
};

/**
 * Format a reason code to a human-readable label.
 * Falls back to title-casing the code if no mapping exists.
 */
export function formatReasonCode(code: string): string {
  if (reasonCodeLabels[code]) {
    return reasonCodeLabels[code];
  }
  
  // Fallback: title-case the code
  return code
    .split("_")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
