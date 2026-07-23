/**
 * The trust layer: "the model proposes, the document decides."
 *
 * Deterministic TypeScript, never a model. Pass 2 proposes a payload; this decides which
 * values survive by checking each against the pass-1 transcription. A model asked to grade its
 * own output can be argued out of its answer by the document; this cannot.
 */

import {
  extractDateTokens,
  extractNumericTokens,
  groundDate,
  groundDigits,
  groundKeyword,
  groundNumber,
  groundString,
  normalizeText,
  type GroundingHit,
} from "./grounding.ts";

export type FieldFlag = {
  field: string;
  reason: "ungrounded" | "sum_mismatch" | "team_prize_detected";
  severity: "high" | "medium" | "low" | "info";
  expected?: number;
  stated?: number;
  /** Present on team_prize_detected: the offending category name, for the review UI and audit log. */
  value?: string;
};

/**
 * Institutional/team prizes (Best Academy, Best School, …) are awarded to a team, not a player.
 * Prize Manager tracks them through institution_prize_groups, configured by the organizer — they
 * must never be committed as ordinary player categories. This is a naming signal, so it lives in
 * the deterministic trust layer, not the model.
 */
const TEAM_PRIZE_NAME = /\b(academy|school|library|club|college|institution)\b/i;

export type GroundingMap = Record<string, GroundingHit>;

export type TrustResult = {
  payload: Record<string, unknown>;
  grounding: GroundingMap;
  flags: FieldFlag[];
  confidence: number;
  /** Structural defects removed before grounding — diagnostics, not field flags. */
  namelessCategoriesDropped: number;
  emptyCategoriesDropped: number;
};

/**
 * Removes categories that are structurally not categories, before any grounding runs.
 *
 * These are prompt-instruction failures the model keeps making despite being told not to
 * ("never emit name:null" held for zero of six affected eval files), so the guarantee moves into
 * code: a nameless fragment or a category that awards nothing (no cash, no trophy, no medal, no
 * gift on any row) is dropped here and can never reach review or commit. Deliberately NOT a
 * field_flag: nothing was extracted-then-unverified — the entry was never a category at all.
 * Runs before the grounding walk so flag paths index the payload the reviewer actually sees.
 */
function pruneStructuralNoise(payload: Record<string, unknown>): { nameless: number; empty: number } {
  const categories = payload.prize_categories;
  if (!Array.isArray(categories)) return { nameless: 0, empty: 0 };

  let nameless = 0;
  let empty = 0;
  const kept = categories.filter((entry) => {
    const category = entry as Record<string, unknown> | null;
    const name = category?.name;
    if (typeof name !== "string" || name.trim() === "") {
      nameless += 1;
      return false;
    }
    const prizes = Array.isArray(category?.prizes) ? (category.prizes as Record<string, unknown>[]) : [];
    const awardsSomething = prizes.some((prize) => {
      const cash = prize?.cash_amount;
      const gift = prize?.gift_description;
      return (typeof cash === "number" && Number.isFinite(cash) && cash > 0) ||
        prize?.has_trophy === true ||
        prize?.has_medal === true ||
        (typeof gift === "string" && gift.trim() !== "");
    });
    if (!awardsSomething) {
      empty += 1;
      return false;
    }
    return true;
  });

  if (nameless > 0 || empty > 0) payload.prize_categories = kept;
  return { nameless, empty };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Booleans assert something no literal in the text can confirm, so they are grounded by the
 * keyword that would have to be present for the claim to be true.
 */
const KEYWORD_PATTERNS: Record<string, RegExp> = {
  fide_rated: /fide[\s\-]*rat/i,
  aicf_rated: /aicf[\s\-]*rat/i,
  // Brochures frequently denote trophies/medals with the symbol instead of the word — a printed
  // trophy emoji IS the document's claim. A boolean set with neither word nor symbol still fails.
  has_trophy: /troph|\u{1F3C6}/iu,
  has_medal: /medal|[\u{1F3C5}\u{1F947}-\u{1F949}]/iu,
};

const EXEMPT_LEAVES = new Set(["is_main", "currency"]);

/**
 * Engine signals, not claims the document makes: `multiple_tournaments_detected` is the model's
 * meta-observation that the brochure holds more than one event, `detected_tournament_names` is the
 * list of event names it named for that observation, and `has_team_prizes` is set by this trust
 * layer itself. None quotes the text as a value to ground against, so grounding would blank them —
 * they are exempt regardless of value. (leafName strips the trailing [n], so each array element of
 * detected_tournament_names matches this set.)
 */
const META_LEAVES = new Set(["multiple_tournaments_detected", "detected_tournament_names", "has_team_prizes"]);

function leafName(path: string): string {
  const last = path.split(".").pop() ?? path;
  return last.replace(/\[\d+\]$/, "");
}

/**
 * Structural values, not claims about the document. Grounding them would flag correct
 * extractions and push every document into review, making `auto_ok` unreachable.
 */
function exemption(path: string, value: unknown): GroundingHit | null {
  const leaf = leafName(path);
  if (EXEMPT_LEAVES.has(leaf)) return { grounded: true, method: "exempt", evidence: null };
  if (META_LEAVES.has(leaf)) return { grounded: true, method: "exempt", evidence: null };
  // "any" is the neutral default of the gender enum, not something a brochure ever prints.
  if (leaf === "gender" && value === "any") return { grounded: true, method: "exempt", evidence: null };
  // A false boolean asserts nothing, so there is nothing to find.
  if (value === false) return { grounded: true, method: "exempt", evidence: null };
  return null;
}

type Context = {
  text: string;
  normalized: string;
  numericTokens: Map<number, number>;
  dateTokens: Map<string, number>;
};

/**
 * The `category` leaves (entry_fees[].category, time_control.category) are labels, not document
 * values: brochures print "ENTRY FEE — OPEN PLAYERS Rs 1300" and the model faithfully writes
 * category "Open Players". Exact-substring grounding flags every such normalization, which is why
 * these two leaves produced 35 of the 82 flags in the 26-brochure eval. Labels are grounded
 * word-wise instead: every content word of the label must appear somewhere in the text. A label
 * whose words are genuinely absent still fails — this is looser matching, not an exemption.
 */
function groundLabel(value: string, ctx: Context): GroundingHit {
  const exact = groundString(value, ctx.text, ctx.normalized);
  if (exact.grounded) return exact;
  const words = normalizeText(value).split(" ").filter((word) => word.length >= 3);
  if (words.length === 0) return exact;
  const textWords = new Set(ctx.normalized.split(" "));
  if (words.every((word) => textWords.has(word))) {
    return { grounded: true, method: "keyword", evidence: `label words present: ${words.join(" ")}` };
  }
  return { grounded: false, method: "keyword", evidence: null };
}

/**
 * time_control.category is a classification, not a quotation — brochures state "90 min + 30 sec"
 * and rarely print the word "classical". The label is grounded if the word itself appears, or if
 * it is the correct FIDE-style classification of the base time the document does state (and which
 * numeric grounding has already checked). A category that contradicts the stated base time still
 * fails.
 */
function groundTimeControlCategory(
  value: string,
  container: Record<string | number, unknown>,
  ctx: Context,
): GroundingHit {
  const worded = groundLabel(value, ctx);
  if (worded.grounded) return worded;
  const base = container["base_minutes"];
  if (typeof base === "number" && Number.isFinite(base) && base > 0) {
    const classified = base < 3 ? "bullet" : base <= 10 ? "blitz" : base < 60 ? "rapid" : "classical";
    if (value.trim().toLowerCase() === classified) {
      return { grounded: true, method: "keyword", evidence: `classified from base_minutes=${base}` };
    }
  }
  return { grounded: false, method: "keyword", evidence: null };
}

function groundLeaf(
  path: string,
  value: string | number | boolean,
  ctx: Context,
  container: Record<string | number, unknown>,
): GroundingHit {
  const exempt = exemption(path, value);
  if (exempt) return exempt;

  const leaf = leafName(path);

  if (typeof value === "boolean") {
    const pattern = KEYWORD_PATTERNS[leaf];
    if (!pattern) return { grounded: false, method: "keyword", evidence: null };
    return groundKeyword(pattern, ctx.text);
  }

  if (typeof value === "number") {
    return groundNumber(value, ctx.text, ctx.numericTokens);
  }

  const trimmed = value.trim();
  if (ISO_DATE_RE.test(trimmed)) return groundDate(trimmed, ctx.text, ctx.dateTokens);
  if (leaf === "contact_phone") return groundDigits(trimmed, ctx.text);
  if (leaf === "category") {
    return path.endsWith("time_control.category")
      ? groundTimeControlCategory(trimmed, container, ctx)
      : groundLabel(trimmed, ctx);
  }
  return groundString(trimmed, ctx.text, ctx.normalized);
}

/**
 * Flags institutional/team prize categories so they are surfaced in review and kept out of the
 * commit (QA #1). Detection is by name only — a category called "Best Academy"/"Best School" etc.
 * — because that is exactly the signal a human reads off the brochure. Runs after grounding so its
 * flag paths index the pruned payload the reviewer sees; sets `has_team_prizes` when any match.
 */
function flagTeamPrizes(payload: Record<string, unknown>, flags: FieldFlag[]): void {
  const categories = payload.prize_categories;
  if (!Array.isArray(categories)) return;

  let found = false;
  categories.forEach((entry, index) => {
    const name = (entry as Record<string, unknown> | null)?.name;
    if (typeof name === "string" && TEAM_PRIZE_NAME.test(name)) {
      found = true;
      flags.push({
        field: `prize_categories[${index}].name`,
        reason: "team_prize_detected",
        severity: "info",
        value: name,
      });
    }
  });

  if (found) payload.has_team_prizes = true;
}

/**
 * Walks every leaf of the payload. Ungrounded leaves are blanked and flagged; leaves that are
 * already null are "absent" — the brochure simply did not say — and pass without a flag.
 */
export function runTrustCheck(rawPayload: Record<string, unknown>, transcription: string): TrustResult {
  const payload = structuredClone(rawPayload);
  const pruned = pruneStructuralNoise(payload);
  const ctx: Context = {
    text: transcription,
    normalized: normalizeText(transcription),
    numericTokens: extractNumericTokens(transcription),
    dateTokens: extractDateTokens(transcription),
  };

  const grounding: GroundingMap = {};
  const flags: FieldFlag[] = [];

  const visit = (container: Record<string | number, unknown>, key: string | number, path: string): void => {
    const value = container[key];

    // Absent: nothing was claimed, so nothing to verify.
    if (value === null || value === undefined || value === "") {
      if (value === "") container[key] = null;
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((_, index) => visit(value as unknown as Record<number, unknown>, index, `${path}[${index}]`));
      return;
    }

    if (typeof value === "object") {
      const child = value as Record<string, unknown>;
      for (const childKey of Object.keys(child)) visit(child, childKey, `${path}.${childKey}`);
      return;
    }

    const hit = groundLeaf(path, value as string | number | boolean, ctx, container);
    grounding[path] = hit;
    if (!hit.grounded) {
      container[key] = null;
      // Product rule (owner decision, batch-eval follow-up): a rated boolean the model set true
      // without a textual "rated" claim is an *inference from logos/aegis lines*, not a document
      // value. It is downgraded to null — no false data committed — but not flagged, because 26/26
      // eval documents flagging on it made auto_ok unreachable while catching nothing real. The
      // extraction prompt also instructs the model to emit null in exactly this case; this branch
      // is the backstop for when it doesn't listen.
      if (leafName(path) === "aicf_rated" || leafName(path) === "fide_rated") return;
      flags.push({ field: path, reason: "ungrounded", severity: "high" });
    }
  };

  for (const key of Object.keys(payload)) visit(payload, key, key);

  // After grounding so the flag paths index the pruned payload, and so a category name that was
  // blanked as ungrounded is no longer a string to match on.
  flagTeamPrizes(payload, flags);

  const checked = Object.values(grounding).filter((hit) => hit.method !== "exempt");
  const groundedCount = checked.filter((hit) => hit.grounded).length;
  const confidence = checked.length === 0 ? 0 : Math.round((groundedCount / checked.length) * 100) / 100;

  return {
    payload,
    grounding,
    flags,
    confidence,
    namelessCategoriesDropped: pruned.nameless,
    emptyCategoriesDropped: pruned.empty,
  };
}

export type ArithmeticResult = {
  sum: number;
  prizeCount: number;
  within: boolean;
  flag: FieldFlag | null;
};

export const SUM_TOLERANCE_INR = 100;

/**
 * Cross-checks the stated prize fund against the sum of every cash prize. Runs on the
 * post-trust payload, so values already blanked as ungrounded cannot prop up the total.
 */
export function runArithmeticCheck(payload: Record<string, unknown>): ArithmeticResult {
  const categories = Array.isArray(payload.prize_categories) ? payload.prize_categories : [];
  let sum = 0;
  let prizeCount = 0;

  for (const category of categories) {
    const prizes = Array.isArray((category as Record<string, unknown>)?.prizes)
      ? ((category as Record<string, unknown>).prizes as unknown[])
      : [];
    for (const prize of prizes) {
      const row = prize as Record<string, unknown>;
      const amount = row?.cash_amount;
      if (typeof amount === "number" && Number.isFinite(amount)) {
        // A grouped row ("11 to 15" at 6500) states one amount paid at each place in the span,
        // so it contributes span × amount — that is what the brochure's total is summing.
        const from = row.rank_from;
        const to = row.rank_to;
        const span = typeof from === "number" && typeof to === "number" &&
            Number.isFinite(from) && Number.isFinite(to) && to >= from
          ? to - from + 1
          : 1;
        sum += amount * span;
        prizeCount += span;
      }
    }
  }

  const fund = payload.total_prize_fund;
  // No stated fund (or nothing to compare) means there is no claim to contradict.
  if (typeof fund !== "number" || !Number.isFinite(fund) || prizeCount === 0) {
    return { sum, prizeCount, within: true, flag: null };
  }

  if (Math.abs(sum - fund) > SUM_TOLERANCE_INR) {
    return {
      sum,
      prizeCount,
      within: false,
      flag: { field: "total_prize_fund", reason: "sum_mismatch", severity: "high", expected: sum, stated: fund },
    };
  }

  return { sum, prizeCount, within: true, flag: null };
}

/**
 * `auto_ok` demands every required field present *and* grounded, arithmetic within tolerance,
 * and no flags of any kind. Anything less is a human's problem.
 */
export function decideStatus(
  payload: Record<string, unknown>,
  grounding: GroundingMap,
  flags: FieldFlag[],
  requiredFields: string[],
  arithmeticWithin: boolean,
): "auto_ok" | "needs_review" {
  const requiredOk = requiredFields.every(
    (field) => payload[field] !== null && payload[field] !== undefined && grounding[field]?.grounded === true,
  );
  return requiredOk && arithmeticWithin && flags.length === 0 ? "auto_ok" : "needs_review";
}
