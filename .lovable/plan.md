# Why "Top 3 Schools" gave no prizes — tournament 19a94d81

## What we found (from the live data)

There is one team prize group, "Top 3 Schools", with 3 prizes. It is set up like this:
- Group players by: Club (school)
- Team size: 4
- Girls minimum: 0
- **Other players minimum: 4**

The player list:
- Only **one** school has 4 players: KR Mangalam World School Vikaspuri. 2 of those 4 are recorded as girls (F).
- Every other school has 3 players or fewer: Kulachi Hansraj 3, Sardar Patel 3, and the rest 1–2.
- 3 players have no school at all.

## Root cause

1. **Team size 4 is bigger than almost every school.** Any school with fewer than 4 players is out ("Fewer players than the team size"). That is 28 of the 29 schools.
2. **"Other players minimum = 4" asks for 4 players who are not girls.** KR Mangalam has 4 players, but 2 are girls, so only 2 count as "other players". That is why its message says "The rule asks for other players and the entry list does not meet it."
3. So no school qualifies, and all 3 prizes stay empty. The app followed the rules as they were set. Nothing failed in the app or in your Excel. The settings just can't be met by this player list.

The confusing part: "Other players minimum 4" with team size 4 quietly turns this into a "no girls allowed" rule. The organizer probably meant "4 players, anyone".

## Fix for this tournament (no code; the organizer does this)

In Setup → Prize Structure → Team Prizes → edit "Top 3 Schools":
- Set **Other players minimum = 0** (and keep Girls minimum = 0). Now any mix of players counts.
- Pick a team size that fits the field:
  - **Team size 4:** only KR Mangalam qualifies, so you get 1 winner and 2 empty prizes.
  - **Team size 3:** KR Mangalam (best 3 of its 4), Kulachi Hansraj and Sardar Patel qualify, so all 3 prizes are filled.
- Then go to Review and press Preview again.

## Product fix (proposed, small, setup screens only)

Step 1 — Warn while setting up (in the Add/Edit Team Prize Group drawer):
- When "Girls minimum" plus "Other players minimum" adds up to the team size and "Other players" is above 0, show: "This means every team member must be a non-girl. Girls will not count. Set Other players to 0 to allow any mix."
- Block saving when the two minimums add up to more than the team size.

Step 2 — Explain empty team prizes on Review:
- When no school qualifies, show a short line above the list, for example: "No school has 4 players. Largest school: 4 (1 school). Schools with 3: 2. Try a smaller team size."
- Use the existing "Fewer players than the team size" counts. Nothing about who is eligible changes.

Step 3 — Clearer label: rename the line "The rule asks for other players and the entry list does not meet it" to "Needs at least N non-girl players; this school has M."

Each step is its own cycle: build it, run the unit tests, check it on this tournament, then wait for your OK.

## Not touched

The team allocation rules and the individual allocation engine stay as they are. No changes to the database, permissions, publishing or payments. The tournament's settings won't be changed unless you ask.

## Technical details

- Data: `institution_prize_groups` id `ca3caea5-…`: team_size=4, female_slots=0, male_slots=4, group_by=club, 3 active prizes.
- Files for Step 1: `src/components/team-prizes/TeamPrizeRulesSheet.tsx` (validation and warning).
- Files for Steps 2 and 3: `src/components/team-prizes/TeamPrizeResultsPanel.tsx` (summary line and reason wording).
- Tests: add unit tests for the slot-sum validation (sum > team_size blocks; male_slots == team_size with female 0 warns).
