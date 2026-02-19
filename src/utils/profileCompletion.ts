/**
 * Profile completion utilities.
 * The 6 fields that count toward profile completion.
 */

export const PROFILE_FIELDS = [
  "display_name",
  "phone",
  "city",
  "org_name",
  "fide_arbiter_id",
  "website",
] as const;

export type ProfileFieldKey = (typeof PROFILE_FIELDS)[number];

export interface ProfileData {
  display_name: string | null;
  phone: string | null;
  city: string | null;
  org_name: string | null;
  fide_arbiter_id: string | null;
  website: string | null;
  profile_completed_at: string | null;
  profile_reward_claimed: boolean;
}

/** Returns number of filled fields (0–6) */
export function filledFieldCount(profile: Partial<ProfileData>): number {
  return PROFILE_FIELDS.filter((f) => {
    const val = profile[f];
    return typeof val === "string" && val.trim().length > 0;
  }).length;
}

/** Returns 0–100 completion percentage */
export function completionPercent(profile: Partial<ProfileData>): number {
  return Math.round((filledFieldCount(profile) / PROFILE_FIELDS.length) * 100);
}

/** Returns true when all 6 fields have non-empty values */
export function isProfileComplete(profile: Partial<ProfileData>): boolean {
  return filledFieldCount(profile) === PROFILE_FIELDS.length;
}
