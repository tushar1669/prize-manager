export const DISCOUNT_TYPE_OPTIONS = ["percent", "amount", "fixed_price"] as const;
export const DB_DISCOUNT_TYPES = ["percent", "amount", "fixed_price"] as const;
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
  if (value === "fixed" || value === "amount") return "amount";
  return "fixed_price";
}

export function toDbDiscountType(value: DiscountType): DbDiscountType {
  return value;
}

export function getDiscountTypeLabel(value: string): string {
  const normalized = normalizeDiscountTypeForUi(value);
  if (normalized === "percent") return "Percent";
  if (normalized === "amount") return "Amount";
  return "Fixed Price";
}

export function formatDiscount(type: string, value: number) {
  const normalized = normalizeDiscountTypeForUi(type);
  const formattedValue =
    normalized === "percent"
      ? `${value}%`
      : normalized === "amount"
        ? `₹${value} off`
        : `₹${value}`;
  return `${getDiscountTypeLabel(type)} (${type}): ${formattedValue}`;
}

export function toDateTimeLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function toIsoFromDateTimeLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function toIsoFromDate(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export type CouponPayloadInput = {
  code: string;
  discount_type: DiscountType;
  discount_value: string;
  starts_at: Date | string | null;
  ends_at: Date | string | null;
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
    starts_at: typeof data.starts_at === "string" ? toIsoFromDateTimeLocalInput(data.starts_at) : toIsoFromDate(data.starts_at),
    ends_at: typeof data.ends_at === "string" ? toIsoFromDateTimeLocalInput(data.ends_at) : toIsoFromDate(data.ends_at),
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
