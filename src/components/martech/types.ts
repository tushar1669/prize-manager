import {
  DEFAULT_APPLIES_TO,
  DEFAULT_DISCOUNT_TYPE,
  formatDiscount,
  type AppliesTo,
  type DiscountType,
} from "@/lib/coupons/constants";

export type { DiscountType, AppliesTo };

export type Coupon = {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  max_redemptions_per_user: number | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  issued_to_email: string | null;
  issued_to_user_id: string | null;
  applies_to?: string | null;
};

export type CouponRedemption = {
  id: string;
  coupon_id: string;
  redeemed_by_user_id: string;
  tournament_id: string;
  amount_before: number;
  discount_amount: number;
  amount_after: number;
  redeemed_at: string;
  meta: Record<string, unknown>;
};

export type CouponFormData = {
  code: string;
  discount_type: DiscountType;
  discount_value: string;
  starts_at: string;
  ends_at: string;
  max_redemptions: string;
  max_redemptions_per_user: string;
  is_active: boolean;
  issued_to_email: string;
  applies_to: AppliesTo;
};

export const emptyCouponForm: CouponFormData = {
  code: "",
  discount_type: DEFAULT_DISCOUNT_TYPE,
  discount_value: "",
  starts_at: "",
  ends_at: "",
  max_redemptions: "",
  max_redemptions_per_user: "1",
  is_active: true,
  issued_to_email: "",
  applies_to: DEFAULT_APPLIES_TO,
};

export { formatDiscount };
