// TC1.6 — organizer-preview masking for team prize winners.
//
// Deliberately the INVERSE of the individual-prize masking rule
// (CategoryCardsView, PosterGridView, ArbiterSheetView all hide the LOWER
// placings and preview the top). Team prizes hide the TOP placing(s) instead:
// the binding rule is that the visible set is a subset of 2nd-place-and-below,
// and 1st place is NEVER revealed to a viewer without full access.
//
// This applies to ORGANIZER preview surfaces only (Finalize, ConflictReview,
// FinalPrizeView). It must never be wired into PublicTeamPrizesSection — a
// published tournament has already been paid for or is free, so the public
// page always renders with `hasFullAccess` at its default of `true` and never
// shows a locked row.
//
// The individual masking rule (`src/utils/reviewAccess.ts`) is untouched by
// this file, per the TC1.6 "do not touch" list.

export interface PlacedPrize {
  id: string;
  place: number;
}

export interface TeamPrizeMaskResult<T extends PlacedPrize> {
  /** Placings the viewer may see. */
  visible: T[];
  /** Placings hidden from this viewer — always includes 1st place when masked. */
  hidden: T[];
}

/**
 * Splits a tournament's FILLED team prizes into what an organizer preview may
 * show and what it must lock, given whether the viewer has full access.
 *
 * `hasFullAccess: true` (paid, free-tier, or any caller — like the public
 * path — that never masks) returns everything visible and nothing hidden.
 *
 * `hasFullAccess: false` hides every prize at place 1 and reveals the rest.
 * Ties on place 1 (if the data ever produced more than one) are all hidden —
 * the rule is "never reveal 1st", not "reveal all but one".
 */
export function selectVisibleTeamPrizes<T extends PlacedPrize>(
  filledPrizes: T[],
  hasFullAccess: boolean
): TeamPrizeMaskResult<T> {
  if (hasFullAccess) {
    return { visible: filledPrizes, hidden: [] };
  }

  const visible: T[] = [];
  const hidden: T[] = [];
  for (const prize of filledPrizes) {
    if (prize.place === 1) {
      hidden.push(prize);
    } else {
      visible.push(prize);
    }
  }
  return { visible, hidden };
}
