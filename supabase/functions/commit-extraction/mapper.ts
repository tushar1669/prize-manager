/**
 * Maps an approved extraction payload to the row shapes commit_extraction_transaction inserts.
 *
 * Pure and dependency-free on purpose: vitest imports this file directly (like the trust-layer
 * tests do for grounding.ts), so everything decidable — rank expansion, trophy-only handling,
 * malformed-row policy — is testable without a database or Deno.
 *
 * Committed categories are STRUCTURE ONLY: name, is_main, order_idx, prizes. criteria_json is
 * always `{}`, exactly what the manual tournament-creation flow leaves it as. The extractor still
 * reads criteria internally (they sharpen Pass 2 and the review display of the payload), but
 * eligibility rules feed the allocation engine, and that engine is configured by the organizer in
 * the app — never by a brochure import. Do not "improve" this by translating extraction criteria
 * into criteria_json; that decision was made deliberately and reversed once already.
 */

export type PayloadPrize = {
  place?: number | null;
  rank_from?: number | null;
  rank_to?: number | null;
  cash_amount?: number | null;
  has_trophy?: boolean | null;
  has_medal?: boolean | null;
  gift_description?: string | null;
};

export type PayloadCriteria = {
  gender?: string | null;
  age_min?: number | null;
  age_max?: number | null;
  rating_min?: number | null;
  rating_max?: number | null;
  city?: string | null;
  state?: string | null;
};

export type PayloadCategory = {
  name?: string | null;
  is_main?: boolean | null;
  criteria?: PayloadCriteria | null;
  prizes?: PayloadPrize[] | null;
};

export type ExtractionPayload = {
  tournament_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  venue?: string | null;
  city?: string | null;
  event_code?: string | null;
  chief_arbiter?: string | null;
  tournament_director?: string | null;
  total_prize_fund?: number | null;
  entry_fees?: Array<{ category?: string | null; amount_inr?: number | null }> | null;
  time_control?: {
    category?: string | null;
    base_minutes?: number | null;
    increment_seconds?: number | null;
  } | null;
  prize_categories?: PayloadCategory[] | null;
};

export type MappedPrize = {
  place: number;
  cash_amount: number;
  has_trophy: boolean;
  has_medal: boolean;
  gift_items: Array<{ name: string; qty: number }>;
};

export type MappedCategory = {
  name: string;
  is_main: boolean;
  criteria_json: Record<string, unknown>;
  order_idx: number;
  prizes: MappedPrize[];
};

export type MappedTournament = {
  owner_id: string;
  title: string;
  start_date: string;
  end_date: string;
  venue: string | null;
  city: string | null;
  event_code: string | null;
  time_control_base_minutes: number | null;
  time_control_increment_seconds: number | null;
  time_control_category: string | null;
  chief_arbiter: string | null;
  tournament_director: string | null;
  entry_fee_amount: number | null;
  cash_prize_total: number | null;
};

export type MappingResult = {
  tournament: MappedTournament;
  categories: MappedCategory[];
  warnings: string[];
};

export class MappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MappingError";
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Ranges wider than this are almost certainly an extraction error, not a prize table. */
const MAX_RANK_SPAN = 200;

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveInt(value: unknown): number | null {
  const n = finiteNumber(value);
  return n !== null && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Picks the entry fee that belongs on the tournament from the list of tiers a brochure prints.
 *
 * A brochure states several fees — a standard rate plus discounts for local players, rated
 * players, women, juniors, and often a higher "late"/"on-the-spot" rate. The tournament carries
 * one number, and it must be the rate a general entrant pays, not whichever tier happens to be
 * listed first. (Jaipur lists the Jaipur-players rate ₹4,750 before the general ₹5,000; taking
 * the first item is wrong.)
 *
 * Rule, in order:
 *   1. A tier explicitly labelled general/standard/all/other players — that is the answer.
 *   2. Otherwise the highest non-late base rate, since discounts only ever go below the standard
 *      one, so the top of the base rates is the general entrant's price.
 *   3. Late / on-the-spot rates are never chosen while any non-late rate exists.
 */
const GENERAL_FEE_LABEL = /\b(general|standard|normal|regular|all\s+player|all\s+other|other\s+player|others)\b/i;
const LATE_FEE_LABEL = /\b(late|on[-\s]?the[-\s]?spot|on[-\s]?spot|spot\s+registration)\b/i;

export function resolveGeneralEntryFee(
  entryFees: Array<{ category?: string | null; amount_inr?: number | null }> | null | undefined,
): number | null {
  const tiers = (Array.isArray(entryFees) ? entryFees : [])
    .map((fee) => ({ label: cleanString(fee?.category) ?? "", amount: finiteNumber(fee?.amount_inr) }))
    .filter((tier): tier is { label: string; amount: number } => tier.amount !== null && tier.amount >= 0);
  if (tiers.length === 0) return null;

  const general = tiers.find((tier) => GENERAL_FEE_LABEL.test(tier.label) && !LATE_FEE_LABEL.test(tier.label));
  if (general) return general.amount;

  const nonLate = tiers.filter((tier) => !LATE_FEE_LABEL.test(tier.label));
  const pool = nonLate.length > 0 ? nonLate : tiers;
  return pool.reduce((max, tier) => (tier.amount > max ? tier.amount : max), pool[0].amount);
}

/**
 * One payload prize row → zero or more concrete prize rows.
 * "11 to 15 at 6500" becomes five rows, places 11..15, 6500 each — the expansion the extraction
 * deliberately stopped doing (invented places are ungroundable), performed here where a human has
 * already approved the payload.
 */
export function expandPrize(prize: PayloadPrize, categoryName: string, warnings: string[]): MappedPrize[] {
  const cash = finiteNumber(prize.cash_amount) ?? 0;
  if (cash < 0) {
    warnings.push(`${categoryName}: negative cash amount ${cash} skipped`);
    return [];
  }

  const hasTrophy = prize.has_trophy === true;
  const hasMedal = prize.has_medal === true;
  const gift = cleanString(prize.gift_description);
  const giftItems = gift ? [{ name: gift, qty: 1 }] : [];

  if (cash === 0 && !hasTrophy && !hasMedal && giftItems.length === 0) {
    // A blank cell is not a prize; committing it would create a row that awards nothing.
    warnings.push(`${categoryName}: row with no cash, trophy, medal or gift skipped`);
    return [];
  }

  const base = { cash_amount: cash, has_trophy: hasTrophy, has_medal: hasMedal, gift_items: giftItems };

  const from = positiveInt(prize.rank_from);
  const to = positiveInt(prize.rank_to);
  if (from !== null && to !== null) {
    if (to < from) {
      warnings.push(`${categoryName}: rank range ${from}-${to} is inverted, skipped`);
      return [];
    }
    if (to - from + 1 > MAX_RANK_SPAN) {
      warnings.push(`${categoryName}: rank range ${from}-${to} exceeds ${MAX_RANK_SPAN} places, skipped`);
      return [];
    }
    const rows: MappedPrize[] = [];
    for (let place = from; place <= to; place++) rows.push({ place, ...base });
    return rows;
  }

  const place = positiveInt(prize.place);
  if (place === null) {
    warnings.push(`${categoryName}: prize with neither place nor rank range skipped`);
    return [];
  }
  return [{ place, ...base }];
}

export function mapPayloadToTables(payload: ExtractionPayload, ownerId: string): MappingResult {
  const warnings: string[] = [];

  const title = cleanString(payload.tournament_name);
  if (!title) throw new MappingError("payload has no tournament_name");

  const startDate = cleanString(payload.start_date);
  if (!startDate || !ISO_DATE_RE.test(startDate)) {
    throw new MappingError("payload has no valid start_date");
  }

  let endDate = cleanString(payload.end_date);
  if (!endDate || !ISO_DATE_RE.test(endDate)) {
    // end_date is NOT NULL in the tournaments table; a one-day event is the honest default.
    warnings.push("no valid end_date; defaulted to start_date");
    endDate = startDate;
  }

  const entryFee = resolveGeneralEntryFee(payload.entry_fees);

  const tournament: MappedTournament = {
    owner_id: ownerId,
    title,
    start_date: startDate,
    end_date: endDate,
    venue: cleanString(payload.venue),
    city: cleanString(payload.city),
    event_code: cleanString(payload.event_code),
    time_control_base_minutes: positiveInt(payload.time_control?.base_minutes),
    time_control_increment_seconds: finiteNumber(payload.time_control?.increment_seconds) ?? null,
    time_control_category: cleanString(payload.time_control?.category),
    chief_arbiter: cleanString(payload.chief_arbiter),
    tournament_director: cleanString(payload.tournament_director),
    entry_fee_amount: entryFee,
    cash_prize_total: finiteNumber(payload.total_prize_fund),
  };

  const categories: MappedCategory[] = [];
  const sourceCategories = Array.isArray(payload.prize_categories) ? payload.prize_categories : [];

  for (const category of sourceCategories) {
    const name = cleanString(category?.name);
    if (!name) {
      warnings.push("category with no name skipped");
      continue;
    }

    const prizes: MappedPrize[] = [];
    const seenPlaces = new Set<number>();
    for (const prize of category?.prizes ?? []) {
      for (const row of expandPrize(prize ?? {}, name, warnings)) {
        if (seenPlaces.has(row.place)) {
          warnings.push(`${name}: duplicate place ${row.place} skipped`);
          continue;
        }
        seenPlaces.add(row.place);
        prizes.push(row);
      }
    }

    categories.push({
      name,
      is_main: category?.is_main === true,
      // Structure only — see the module comment. The RPC hardcodes '{}' as well.
      criteria_json: {},
      order_idx: categories.length,
      prizes,
    });
  }

  if (categories.length === 0) {
    warnings.push("payload has no prize categories; tournament will be created empty");
  }

  return { tournament, categories, warnings };
}
