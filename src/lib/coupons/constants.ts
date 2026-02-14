export const DISCOUNT_TYPE_OPTIONS = ["percent", "amount"] as const;
export const DB_DISCOUNT_TYPES = ["percentage", "fixed"] as const;
export const APPLIES_TO_OPTIONS = ["tournament_pro"] as const;

export type DiscountType = (typeof DISCOUNT_TYPE_OPTIONS)[number];
export type DbDiscountType = (typeof DB_DISCOUNT_TYPES)[number];
export type AppliesTo = (typeof APPLIES_TO_OPTIONS)[number];

export const DEFAULT_DISCOUNT_TYPE: DiscountType = "percent";
export const DEFAULT_APPLIES_TO: AppliesTo = "tournament_pro";

export function isValidAppliesTo(value: string): value is AppliesTo {
  return APPLIES_TO_OPTIONS.includes(value as AppliesTo);
}

export function normalizeDiscountTypeForUi(value: string): DiscountType {
  if (value === "percent" || value === "percentage") return "percent";
  return "amount";
}

export function toDbDiscountType(value: DiscountType): DbDiscountType {
  return value === "percent" ? "percentage" : "fixed";
}

export function getDiscountTypeLabel(value: string): string {
  const normalized = normalizeDiscountTypeForUi(value);
  return normalized === "percent" ? "Percent" : "Amount";
}

export function formatDiscount(type: string, value: number) {
  const normalized = normalizeDiscountTypeForUi(type);
  const formattedValue = normalized === "percent" ? `${value}%` : `₹${value} off`;
  return `${getDiscountTypeLabel(type)} (${type}): ${formattedValue}`;
}

export type CouponPayloadInput = {
  code: string;
  discount_type: DiscountType;
  discount_value: string;
  starts_at: string;
  ends_at: string;
  max_redemptions: string;
  max_redemptions_per_user: string;
  is_active: boolean;
  issued_to_email: string;
  applies_to?: string;
};

export function buildCouponPayload(data: CouponPayloadInput, createdBy?: string | null) {
  const appliesTo = data.applies_to ?? DEFAULT_APPLIES_TO;

  if (!isValidAppliesTo(appliesTo)) {
    throw new Error(
      `Invalid applies_to value: ${appliesTo}. Allowed values: ${APPLIES_TO_OPTIONS.join(", ")}.`,
    );
  }

  return {
    code: data.code.trim().toUpperCase(),
    discount_type: toDbDiscountType(data.discount_type),
    discount_value: Number(data.discount_value) || 0,
    starts_at: data.starts_at || null,
    ends_at: data.ends_at || null,
    max_redemptions: data.max_redemptions ? Number(data.max_redemptions) : null,
    max_redemptions_per_user: data.max_redemptions_per_user
      ? Number(data.max_redemptions_per_user)
      : null,
    is_active: data.is_active,
    issued_to_email: data.issued_to_email?.trim() || null,
    applies_to: appliesTo,
    ...(createdBy ? { created_by: createdBy } : {}),
  };
}
