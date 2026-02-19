import { describe, it, expect } from "vitest";
import {
  filledFieldCount,
  completionPercent,
  isProfileComplete,
  type ProfileData,
} from "@/utils/profileCompletion";

const EMPTY: Partial<ProfileData> = {
  display_name: null,
  phone: null,
  city: null,
  org_name: null,
  fide_arbiter_id: null,
  profile_completed_at: null,
  profile_reward_claimed: false,
};

const PARTIAL: Partial<ProfileData> = {
  display_name: "Test User",
  phone: "+91 12345",
  city: "",
  org_name: null,
  fide_arbiter_id: null,
};

const FULL: Partial<ProfileData> = {
  display_name: "Test User",
  phone: "+91 12345",
  city: "Mumbai",
  org_name: "Chess Club",
  fide_arbiter_id: "12345678",
};

describe("profileCompletion", () => {
  it("returns 0 for empty profile", () => {
    expect(filledFieldCount(EMPTY)).toBe(0);
    expect(completionPercent(EMPTY)).toBe(0);
    expect(isProfileComplete(EMPTY)).toBe(false);
  });

  it("counts only non-empty string fields", () => {
    expect(filledFieldCount(PARTIAL)).toBe(2);
    expect(completionPercent(PARTIAL)).toBe(40);
    expect(isProfileComplete(PARTIAL)).toBe(false);
  });

  it("returns 100% for fully filled profile", () => {
    expect(filledFieldCount(FULL)).toBe(5);
    expect(completionPercent(FULL)).toBe(100);
    expect(isProfileComplete(FULL)).toBe(true);
  });

  it("treats whitespace-only as empty", () => {
    const ws: Partial<ProfileData> = { ...FULL, city: "   " };
    expect(filledFieldCount(ws)).toBe(4);
    expect(isProfileComplete(ws)).toBe(false);
  });
});
