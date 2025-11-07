# How Prizes Are Decided — Plain English Guide for Organizers

**Last Updated:** 2025-11-07  
**Audience:** Tournament organizers using Prize-Manager

---

## What This Guide Covers

This guide explains how Prize-Manager automatically assigns prizes to players based on their final tournament standings. You don't need to understand code or algorithms — just the key principles that drive the system.

---

## What We Use to Decide

When you click "Allocate Prizes," the system uses:

1. **Final Tournament Rankings**
   - The official rank each player achieved (from your Swiss-Manager import or manual entry)
   - This is always the **absolute rank**, not category-specific rankings

2. **Categories You Created**
   - Age groups, gender groups, rating bands, etc.
   - The **order** you set in your brochure matters (see below!)

3. **Prizes You Defined**
   - Cash amounts, trophies, medals for each category
   - Which place each prize is for (1st, 2nd, 3rd, etc.)

4. **Eligibility Rules**
   - Age limits (calculated on tournament start date)
   - Gender requirements
   - Rating ranges (and whether unrated players can participate)
   - Optional filters: city, state, club, disability status

5. **Any Manual Overrides You Set**
   - If you need to adjust a prize assignment, you can override the automatic system

---

## How It Works (Step by Step)

### Step 1: We Sort All Your Prizes

Before we start assigning prizes, we put them in order based on:

1. **Brochure order** (most important!)
   - The order you arranged your categories in your prize brochure
   - Example: If "Open Championship" is first, its prizes come before "Girls Under 14"

2. **Value of the prize**
   - Cash + Trophy beats Cash + Medal beats Cash-only beats Trophy-only beats Medal-only

3. **Which place**
   - 1st place comes before 2nd place, etc.

**Why this matters:** The system goes through prizes in this order. Once a player wins a prize, they're usually out of the running for later prizes (unless you've configured "allow multiple prizes" mode).

---

### Step 2: We Process Your Manual Overrides (If Any)

If you said "Give prize X to player Y no matter what," we do that first, before any automatic assignments. We still check that the player is eligible (right age, gender, etc.).

---

### Step 3: For Each Prize, We Find the Winner

Now the system goes through each prize in order and asks:

1. **Who is eligible?**
   - Right age? ✓
   - Right gender? ✓
   - Right rating range? ✓
   - City/state/club matches (if required)? ✓
   - Hasn't already won a prize? ✓

2. **If multiple people are eligible, who wins?**

   This is where **deterministic tie-breaking** comes in:

   ```
   Always start from the official final ranking.
   
   If two players tie on rank, we look at rating (higher wins).
   
   If rating is also the same, we sort alphabetically by name.
   ```

   **Example:**
   - Player A: Rank 5, Rating 1850, Name "Kumar"
   - Player B: Rank 5, Rating 1920, Name "Patel"
   - Player C: Rank 5, Rating 1920, Name "Singh"
   
   **Winner:** Player B (Patel) wins because:
   - Same rank as A and C
   - Higher rating than A
   - Alphabetically before C (same rating)

3. **Assign the prize**
   - The winner gets the prize
   - They're marked as "already won" (if you're using standard rules)
   - Move on to the next prize

---

### Step 4: Handle Unfilled Prizes

If a prize has no eligible players (e.g., no girls under 10 entered the tournament), we mark it as "unfilled." You'll see this in the results so you know which prizes weren't awarded.

---

## What If a Player Qualifies for Multiple Categories?

This is common! A 12-year-old girl might qualify for:
- Open Championship (everyone qualifies)
- Girls Championship
- Under 14 Championship

**How we handle it:**

By default, players can **win only one prize** (the first they qualify for in your brochure order).

**Example:**
- Your brochure order: Open (1st), Girls (2nd), Under 14 (3rd)
- Player qualifies for all three
- Player wins Open 1st place
- Player is **excluded** from Girls and Under 14 prizes
- Next eligible players win those prizes

**Future option:** We're adding a setting to allow players to win multiple prizes if you want that.

---

## Consistency Check (Coming Soon)

We're adding a background check that will warn you if a category result looks "out of order" compared to the final ranking.

**Example scenario:**
- Final rankings: Alice (rank 1), Bob (rank 2), Charlie (rank 3)
- Alice wins Open 1st place (eliminated from other categories)
- Bob is ineligible for "Under 14" category
- Charlie wins Under 14 1st place

This is **valid** — Charlie won a category prize even though Bob ranked higher, because Bob wasn't eligible. But we'll show you a note so you can double-check if this is what you intended.

**Important:** This check won't change the results. It's just a heads-up to help you catch potential issues.

---

## Examples with Tables

### Example 1: Simple Allocation

**Categories:**
1. Open Championship (brochure order 1)
2. Girls Championship (brochure order 2)

**Players:**
| Name   | Rank | Gender | Rating |
|--------|------|--------|--------|
| Alice  | 1    | F      | 2100   |
| Bob    | 2    | M      | 2000   |
| Charlie| 3    | M      | 1950   |
| Diana  | 4    | F      | 1900   |

**Prizes:**
- Open 1st place: ₹10,000 + Trophy
- Open 2nd place: ₹5,000 + Medal
- Girls 1st place: ₹3,000 + Trophy

**Results:**
- **Open 1st:** Alice (rank 1, first in line)
- **Open 2nd:** Bob (rank 2, Alice already won)
- **Girls 1st:** Diana (rank 4, only eligible girl remaining — Alice already won Open)

---

### Example 2: Tie-Breaking by Rating

**Categories:**
1. Under 12 Championship

**Players:**
| Name    | Rank | Age | Rating |
|---------|------|-----|--------|
| Emma    | 5    | 11  | 1500   |
| Fatima  | 5    | 10  | 1600   |
| Grace   | 5    | 11  | 1450   |

All three players have the **same rank** (5). Who wins Under 12 1st place?

**Result:**
- **Under 12 1st:** Fatima (rank 5, highest rating 1600)

---

### Example 3: Tie-Breaking by Name

**Categories:**
1. Open Championship

**Players:**
| Name    | Rank | Rating |
|---------|------|--------|
| Kumar   | 3    | 1800   |
| Patel   | 3    | 1800   |
| Singh   | 3    | 1800   |

All three players have **identical rank AND rating**. Who wins?

**Result:**
- **Open 1st:** Kumar (alphabetically first: K < P < S)

---

## FAQ

### Q: Can I change the brochure order after importing players?
**A:** Yes! Go to the Category Order Review page. But remember: changing the order affects which prizes players win. Re-run allocation after changing order.

---

### Q: What happens if I add a manual override?
**A:** Manual overrides are processed **first**, before automatic allocation. The system will still check that the player is eligible (age, gender, etc.). If valid, the prize is assigned; if not, you'll see a conflict.

---

### Q: Why did a lower-ranked player win a category prize?
**A:** This usually means higher-ranked players either:
1. Were not eligible for that category (wrong age, gender, etc.)
2. Already won a different prize earlier in the brochure order

Check the eligibility rules for that category.

---

### Q: Can a player win multiple prizes?
**A:** By default, no — players win one prize and are excluded from further prizes. We're adding a setting to allow multiple prizes per player in a future update.

---

### Q: What if there are no eligible players for a prize?
**A:** The prize will be marked as "unfilled" in the results. You can review and decide whether to:
1. Adjust category eligibility rules
2. Manually assign the prize to someone
3. Leave it unawarded

---

### Q: How is age calculated?
**A:** Age is calculated on the **tournament start date** you entered. We use the player's date of birth from their registration.

**Example:**
- Tournament starts: 2025-03-15
- Player born: 2013-06-20
- Age on tournament start: 11 years (turns 12 later in 2025, but is 11 during tournament)

---

### Q: What happens with unrated players in rating categories?
**A:** By default, unrated players are **excluded** from rating-specific categories (e.g., "Under 1600"). You can enable a rule to allow unrated players if you want. Go to Settings → Allocation Rules.

---

### Q: Can I see exactly why each prize was awarded?
**A:** Yes! After allocation, you'll see logs showing:
- Which player won each prize
- Their rank, rating, and name
- Whether tie-breaking was used (and which method: rating or name)
- Any conflicts or unfilled prizes

---

### Q: What if I don't like the results?
**A:** You can:
1. Use manual overrides to adjust specific prizes
2. Modify category/prize definitions
3. Re-run allocation as many times as needed
4. Nothing is final until you click "Finalize & Publish"

---

## Need Help?

- **Read the technical spec:** [Prize Allocation Algorithm Specification](./README.md)
- **Check your allocation logs:** Available on the Finalize page after running allocation
- **Contact support:** Use the in-app help or contact your Prize-Manager administrator

---

**Remember:** The system is deterministic. If you run allocation twice with the same data and rules, you'll get the **exact same results**. This ensures fairness and transparency.
