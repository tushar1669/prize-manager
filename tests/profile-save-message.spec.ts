import { describe, it, expect } from "vitest";
import {
  couponWasJustIssued,
  saveSuccessMessage,
  PROFILE_SAVED_MESSAGE,
  PROFILE_REWARD_MESSAGE,
} from "@/hooks/useOrganizerProfile";

/**
 * The bug this guards: the toast used to be picked from the profile_completed_at
 * null -> set transition, so a user already past that transition was issued a
 * coupon (PROFILE-0649F039, confirmed in production) and told only "Profile saved.".
 * The message must follow update_my_profile's `reward` key, never the transition.
 */

/** A complete update_my_profile response, with `reward` swapped per case. */
const response = (reward: unknown) => ({
  display_name: "Test User",
  phone: "+919876543210",
  city: "Jaipur",
  org_name: "Chess Club",
  fide_arbiter_id: "12345678",
  profile_completed_at: "2026-09-09T16:14:00+00:00",
  profile_reward_claimed: true,
  reward,
});

describe("save message selection", () => {
  it("announces the reward when this save issued the coupon", () => {
    const data = response({
      ok: true,
      already_claimed: false,
      coupon_code: "PROFILE-0649F039",
      coupon_id: "6f1b2c4e-2b7a-4d5e-9a1f-0c3d5e7f9a1b",
    });
    expect(couponWasJustIssued(data)).toBe(true);
    expect(saveSuccessMessage(data)).toBe(PROFILE_REWARD_MESSAGE);
    expect(saveSuccessMessage(data)).toMatch(/free tournament/i);
  });

  it("announces the reward even when the profile was already complete before this save", () => {
    // The exact production case: profile_completed_at was already set, so the old
    // transition test said "no news" while the server was minting a coupon.
    const data = {
      ...response({ ok: true, already_claimed: false, coupon_code: "PROFILE-0649F039" }),
      profile_completed_at: "2026-08-01T10:00:00+00:00",
    };
    expect(saveSuccessMessage(data)).toBe(PROFILE_REWARD_MESSAGE);
  });

  it("stays quiet when the coupon was already claimed", () => {
    const data = response({
      ok: true,
      already_claimed: true,
      coupon_code: "PROFILE-0649F039",
    });
    expect(couponWasJustIssued(data)).toBe(false);
    expect(saveSuccessMessage(data)).toBe(PROFILE_SAVED_MESSAGE);
  });

  it("stays quiet when the reward was not attempted", () => {
    expect(saveSuccessMessage(response(null))).toBe(PROFILE_SAVED_MESSAGE);

    const { reward: _omitted, ...withoutKey } = response(null);
    expect(couponWasJustIssued(withoutKey)).toBe(false);
    expect(saveSuccessMessage(withoutKey)).toBe(PROFILE_SAVED_MESSAGE);
  });

  it("stays quiet when the reward reports a failure", () => {
    expect(saveSuccessMessage(response({ ok: false, reason: "profile_incomplete" })))
      .toBe(PROFILE_SAVED_MESSAGE);
    expect(saveSuccessMessage(response({ ok: false, reason: "not_authenticated" })))
      .toBe(PROFILE_SAVED_MESSAGE);
  });

  it("stays quiet on a malformed reward without throwing", () => {
    const malformed: unknown[] = [
      response("PROFILE-0649F039"),
      response(42),
      response(true),
      response([]),
      response({}),
      response({ ok: "true", already_claimed: "false" }),
      response({ ok: true }),
      response({ already_claimed: false }),
      response({ ok: true, already_claimed: null }),
      response({ ok: 1, already_claimed: 0 }),
      null,
      undefined,
      "unexpected string body",
      42,
    ];
    for (const data of malformed) {
      expect(() => saveSuccessMessage(data)).not.toThrow();
      expect(saveSuccessMessage(data)).toBe(PROFILE_SAVED_MESSAGE);
    }
  });
});
