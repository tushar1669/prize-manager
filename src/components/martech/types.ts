export type DiscountType = "percent" | "amount" | "fixed_price";

export type Coupon = {
  id: string;
  code: string;
  discount_type: DiscountType;
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
};

export const emptyCouponForm: CouponFormData = {
  code: "",
  discount_type: "percent",
  discount_value: "",
  starts_at: "",
  ends_at: "",
  max_redemptions: "",
  max_redemptions_per_user: "1",
  is_active: true,
  issued_to_email: "",
};

export function formatDiscount(type: DiscountType | string, value: number) {
  if (type === "percent") return `${value}%`;
  if (type === "fixed_price") return `₹${value} final`;
  return `₹${value} off`;
}
