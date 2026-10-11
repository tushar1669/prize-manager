# Two findings

## A. Why "Top 3 Schools" gave no prizes (tournament 19a94d81)

**Settings:** Group by Club, Team size 4, Girls minimum 0, **Other players minimum 4**.

**Player list:** Only KR Mangalam has 4 players, and 2 of them are girls. Every other school has 3 players or fewer.

**Root cause:** "Other players minimum 4" with team size 4 means all 4 team members must be non-girls. KR Mangalam has only 2 such players, so it fails. The other 28 schools fail because they have fewer than 4 players. No school qualifies, so all 3 prizes stay empty. The app applied the rules as set. Your Excel is fine; the settings just can't be met by this player list.

**Fix for this tournament (organizer, no code):** Edit "Top 3 Schools":
- Set Other players minimum to 0.
- Then choose a team size:
  - **Team size 3:** KR Mangalam, Kulachi Hansraj and Sardar Patel qualify, so all 3 prizes are filled.
  - **Team size 4:** only KR Mangalam qualifies, so you get 1 winner.
- Press Preview again on Review.

**Product fix (small, setup and review screens only):**
1. In the team group drawer, warn when the minimums add up to the team size: "Girls will not count. Set Other players to 0 to allow any mix." Block saving when the minimums add up to more than the team size.
2. On Review, when no school qualifies, add a summary line, for example "No school has 4 players. Largest: 4 (1 school). Try a smaller team size."
3. Plain wording: replace "The rule asks for other players and the entry list does not meet it" with "Needs at least N non-girl players; this school has M."

## B. Can a profile-reward coupon unlock free Pro?

**What I checked (live data, read-only):**
- There are 4 profile-reward coupons, all claimed by their owners. Each is 100% off Pro, active, and has no expiry. **0 have ever been used.**
- The welcome, referral and admin coupons have exactly the same shape and go through the same redeem step. Their redemptions did unlock Pro: each one created a Pro access record (8 of 8).
- The redeem step checks that the person using the coupon is the person it was issued to. All 4 profile coupons are issued to the right account, and each of those accounts owns a tournament.

**Conclusion:** I found nothing in the system that blocks a profile-reward coupon. The same path works for the other coupon types with identical settings. The most likely reason none has been used is that nobody has tried yet. I could not run a real redemption: I can't sign in as an organizer here, and testing would use up a real coupon. So this is **not verified end to end**.

**Proposed next step (no code):** an organizer with a profile coupon opens their tournament's Payment page, enters the code, and applies it. Pro should switch on straight away. If it fails, send a screenshot of the message.

**Small proposed improvement:** on the Payment page, show the organizer's own unused coupons as "Use this code" buttons, so they don't have to copy codes from the Account page. This is display only; redemption rules stay as they are.

## Not touched
The allocation engine, coupon and payment rules, the database, permissions and publishing all stay as they are.

## Technical details
- A: `institution_prize_groups` ca3caea5: team_size=4, female_slots=0, male_slots=4. Files: `TeamPrizeRulesSheet.tsx` (validation), `TeamPrizeResultsPanel.tsx` (summary and wording), plus a unit test for the slot-sum check.
- B: `redeem_coupon_for_tournament` / `apply_coupon_for_tournament` check `issued_to_user_id = auth.uid()`, max redemptions, and expiry. Origin is not checked, so profile_reward follows the same branch as welcome (8/8 redemptions have a `source='coupon'` entitlement). Improvement file: `src/pages/TournamentUpgrade.tsx`.
