import { PUBLIC_DOB_MASKING } from "@/utils/featureFlags";

export function maskDobForPublic(
  dob?: string | null,
  mask: boolean = PUBLIC_DOB_MASKING
): string {
  if (!dob) return "--";
  if (!mask) return dob;

  const [year, month] = dob.split("-");
  if (!year) return "--";

  const safeMonth = month && month !== "00" ? month : "--";
  return `${year}-${safeMonth}`;
}
