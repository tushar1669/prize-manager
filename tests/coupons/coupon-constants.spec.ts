import { describe, expect, it } from "vitest";
import {
  buildCouponPayload,
  formatDiscount,
  normalizeDiscountTypeForUi,
  toDbDiscountType,
} from "@/lib/coupons/constants";

describe("coupon constants", () => {
  it("maps UI discount types to DB-compatible values", () => {
    expect(toDbDiscountType("percent")).toBe("percentage");
    expect(toDbDiscountType("amount")).toBe("fixed");
  });

  it("normalizes legacy and modern stored values for UI", () => {
    expect(normalizeDiscountTypeForUi("percentage")).toBe("percent");
    expect(normalizeDiscountTypeForUi("percent")).toBe("percent");
    expect(normalizeDiscountTypeForUi("fixed")).toBe("amount");
    expect(normalizeDiscountTypeForUi("amount")).toBe("amount");
  });

  it("builds payload with normalized values and applies_to", () => {
    const payload = buildCouponPayload({
      code: " welcome20 ",
      discount_type: "percent",
      discount_value: "20",
      starts_at: "",
      ends_at: "",
      max_redemptions: "",
      max_redemptions_per_user: "1",
      is_active: true,
      issued_to_email: "user@example.com",
      applies_to: "tournament_pro",
    }, "user-id");

    expect(payload).toMatchObject({
      code: "WELCOME20",
      discount_type: "percentage",
      discount_value: 20,
      applies_to: "tournament_pro",
      created_by: "user-id",
    });
  });

  it("fails fast on invalid applies_to", () => {
    expect(() =>
      buildCouponPayload({
        code: "SAVE10",
        discount_type: "amount",
        discount_value: "100",
        starts_at: "",
        ends_at: "",
        max_redemptions: "",
        max_redemptions_per_user: "1",
        is_active: true,
        issued_to_email: "",
        applies_to: "all_plans",
      }),
    ).toThrow("Invalid applies_to value");
  });

  it("formats discount with human label and stored value", () => {
    expect(formatDiscount("percentage", 15)).toBe("Percent (percentage): 15%");
    expect(formatDiscount("fixed", 200)).toBe("Amount (fixed): ₹200 off");
  });
});
