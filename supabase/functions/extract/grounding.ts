/**
 * Normalization-aware grounding checks.
 *
 * "The model proposes, the document decides" — a value only survives if it can
 * be found in the pass-1 transcription after normalization. Matching is done
 * against token *sets* rather than raw substrings so that 100 does not ground
 * itself inside 1000.
 */

export type GroundingMethod = "numeric" | "date" | "string" | "digits" | "keyword" | "exempt";

export type GroundingHit = {
  grounded: boolean;
  method: GroundingMethod;
  evidence: string | null;
};

const EVIDENCE_RADIUS = 60;

/** Collapse case, punctuation and whitespace so surface formatting stops mattering. */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[₹]/g, " rs ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function evidenceAround(haystack: string, index: number, length: number): string {
  let start = Math.max(0, index - EVIDENCE_RADIUS);
  let end = Math.min(haystack.length, index + length + EVIDENCE_RADIUS);
  // A window boundary that lands between the halves of a surrogate pair (emoji are common in
  // brochures: 🏆 medals and trophies) would leave a lone surrogate in the excerpt — which is
  // invalid JSON downstream and failed a whole extraction insert once. Snap outward off a pair.
  const isLowSurrogate = (i: number) => {
    const code = haystack.charCodeAt(i);
    return code >= 0xDC00 && code <= 0xDFFF;
  };
  if (start > 0 && isLowSurrogate(start)) start -= 1;
  if (end < haystack.length && isLowSurrogate(end)) end += 1;
  return `${start > 0 ? "…" : ""}${haystack.slice(start, end).replace(/\s+/g, " ").trim()}${end < haystack.length ? "…" : ""}`;
}

/* ------------------------------------------------------------------ numbers */

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  lac: 100_000,
  lacs: 100_000,
  lakh: 100_000,
  lakhs: 100_000,
  crore: 10_000_000,
  crores: 10_000_000,
};

/**
 * Every number the document states, canonicalized. Handles Indian grouping
 * (1,00,000), western grouping (100,000) and magnitude words (1.5 lakh).
 */
export function extractNumericTokens(text: string): Map<number, number> {
  const tokens = new Map<number, number>(); // value -> index of first occurrence

  const plain = /\d[\d,]*(?:\.\d+)?/g;
  for (let m = plain.exec(text); m !== null; m = plain.exec(text)) {
    const value = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(value) && !tokens.has(value)) tokens.set(value, m.index);
  }

  const scaled = /(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lacs?|lakhs?|crores?)\b/gi;
  for (let m = scaled.exec(text); m !== null; m = scaled.exec(text)) {
    const base = Number(m[1].replace(/,/g, ""));
    const multiplier = MULTIPLIERS[m[2].toLowerCase()];
    if (!Number.isFinite(base) || !multiplier) continue;
    const value = base * multiplier;
    if (!tokens.has(value)) tokens.set(value, m.index);
  }

  return tokens;
}

export function groundNumber(value: number, text: string, tokens: Map<number, number>): GroundingHit {
  for (const [token, index] of tokens) {
    if (Math.abs(token - value) < 0.01) {
      return { grounded: true, method: "numeric", evidence: evidenceAround(text, index, String(token).length) };
    }
  }
  return { grounded: false, method: "numeric", evidence: null };
}

/* -------------------------------------------------------------------- dates */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const full = year < 100 ? (year < 50 ? 2000 + year : 1900 + year) : year;
  return `${full}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Every date the document states, canonicalized to YYYY-MM-DD. Numeric
 * day/month order is ambiguous, so both readings are admitted — over-accepting
 * a date is preferable to falsely flagging a correct one as invented.
 */
export function extractDateTokens(text: string): Map<string, number> {
  const tokens = new Map<string, number>();
  const add = (value: string | null, index: number) => {
    if (value && !tokens.has(value)) tokens.set(value, index);
  };

  const iso = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
  for (let m = iso.exec(text); m !== null; m = iso.exec(text)) {
    add(isoDate(Number(m[1]), Number(m[2]), Number(m[3])), m.index);
  }

  const numeric = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/g;
  for (let m = numeric.exec(text); m !== null; m = numeric.exec(text)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const year = Number(m[3]);
    add(isoDate(year, b, a), m.index); // DD/MM/YYYY — dominant in Indian brochures
    add(isoDate(year, a, b), m.index); // MM/DD/YYYY
  }

  // "15th - 17th August 2026" — a range states both endpoints.
  const range = /\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:to|till|until|[-–—&]|and)\s*(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?,?\s*(\d{4})\b/gi;
  for (let m = range.exec(text); m !== null; m = range.exec(text)) {
    const month = MONTHS[m[3].toLowerCase()];
    if (!month) continue;
    add(isoDate(Number(m[4]), month, Number(m[1])), m.index);
    add(isoDate(Number(m[4]), month, Number(m[2])), m.index);
  }

  // "15th August 2026" / "15 Aug 2026"
  const dayFirst = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?,?\s*(\d{4})\b/gi;
  for (let m = dayFirst.exec(text); m !== null; m = dayFirst.exec(text)) {
    const month = MONTHS[m[2].toLowerCase()];
    add(month ? isoDate(Number(m[3]), month, Number(m[1])) : null, m.index);
  }

  // "August 15, 2026"
  const monthFirst = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})\b/gi;
  for (let m = monthFirst.exec(text); m !== null; m = monthFirst.exec(text)) {
    const month = MONTHS[m[1].toLowerCase()];
    add(month ? isoDate(Number(m[3]), month, Number(m[2])) : null, m.index);
  }

  return tokens;
}

export function groundDate(value: string, text: string, tokens: Map<string, number>): GroundingHit {
  const index = tokens.get(value.trim());
  if (index === undefined) return { grounded: false, method: "date", evidence: null };
  return { grounded: true, method: "date", evidence: evidenceAround(text, index, 10) };
}

/* ------------------------------------------------------------------ strings */

export function groundString(value: string, text: string, normalized: string): GroundingHit {
  const needle = normalizeText(value);
  if (!needle) return { grounded: false, method: "string", evidence: null };
  const index = normalized.indexOf(needle);
  if (index === -1) return { grounded: false, method: "string", evidence: null };
  return { grounded: true, method: "string", evidence: evidenceAround(normalized, index, needle.length) };
}

/** Phone numbers survive reformatting; compare digits only. */
export function groundDigits(value: string, text: string): GroundingHit {
  const needle = value.replace(/\D/g, "");
  if (needle.length < 6) return { grounded: false, method: "digits", evidence: null };
  const digitsOnly = text.replace(/\D/g, "");
  if (!digitsOnly.includes(needle)) return { grounded: false, method: "digits", evidence: null };
  return { grounded: true, method: "digits", evidence: `digits ${needle}` };
}

export function groundKeyword(pattern: RegExp, text: string): GroundingHit {
  const match = pattern.exec(text);
  if (!match) return { grounded: false, method: "keyword", evidence: null };
  return { grounded: true, method: "keyword", evidence: evidenceAround(text, match.index, match[0].length) };
}
