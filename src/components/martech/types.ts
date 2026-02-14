export type Coupon = {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed";
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
  user_id: string;
  discount_amount: number;
  redeemed_at: string;
  metadata: Record<string, unknown>;
  tournament_id: string | null;
};

export type CouponFormData = {
  code: string;
  discount_type: "percentage" | "fixed";
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
  discount_type: "percentage",
  discount_value: "",
  starts_at: "",
  ends_at: "",
  max_redemptions: "",
  max_redemptions_per_user: "1",
  is_active: true,
  issued_to_email: "",
};

export function formatDiscount(type: string, value: number) {
  return type === "percentage" ? `${value}%` : `₹${value}`;
}
