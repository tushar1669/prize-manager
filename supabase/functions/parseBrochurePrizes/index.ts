import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import pdfParse from "npm:pdf-parse@1.1.1";
import { hasPingQueryParam, pingResponse, CORS_HEADERS } from "../_shared/health.ts";

const BUILD_VERSION = "2026-03-29T01:00:00Z";
const FUNCTION_NAME = "parseBrochurePrizes";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const EVENT_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "Rapid", pattern: /\brapid\b/i },
  { label: "Blitz", pattern: /\bblitz\b/i },
  { label: "Classical", pattern: /\bclassical\b/i },
  { label: "Standard", pattern: /\bstandard\b/i },
];

// ── Helpers ──────────────────────────────────────────────────────────────

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function getExtension(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return "";
  return path.slice(dot).toLowerCase();
}

function detectEvents(text: string): string[] {
  return EVENT_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ label }) => label);
}

function normalizeTextLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function normalizeSectionName(name: string): string {
  return normalizeTextLine(name).toLowerCase();
}

async function ensureTournamentAccess(
  supabase: SupabaseClient,
  userId: string,
  tournamentId: string
): Promise<{ accessDenied: Response | null; tournament: { brochure_url: string | null } | null }> {
  const { data: tournament, error: tErr } = await supabase
    .from("tournaments")
    .select("id, owner_id, brochure_url")
    .eq("id", tournamentId)
    .maybeSingle();

  if (tErr) {
    return { accessDenied: jsonResponse({ error: "db_error", message: tErr.message }, 500), tournament: null };
  }
  if (!tournament) {
    return { accessDenied: jsonResponse({ error: "tournament_not_found" }, 404), tournament: null };
  }

  const { data: isMaster, error: roleErr } = await supabase
    .rpc("has_role", { _user_id: userId, _role: "master" });

  if (roleErr) {
    return { accessDenied: jsonResponse({ error: "role_check_failed", message: roleErr.message }, 500), tournament: null };
  }
  if (tournament.owner_id !== userId && !isMaster) {
    return { accessDenied: jsonResponse({ error: "forbidden", message: "Not authorized for tournament" }, 403), tournament: null };
  }
  return { accessDenied: null, tournament: { brochure_url: tournament.brochure_url ?? null } };
}

// ── Draft parsing types ──────────────────────────────────────────────────

type Confidence = "HIGH" | "MEDIUM" | "LOW";

interface DraftPrize {
  place: number;
  cash_amount: number;
  has_trophy: boolean;
  has_medal: boolean;
  gift_items: string[];
  confidence: Confidence;
  source_text: string;
}

interface DraftCategory {
  name: string;
  is_main: boolean;
  order_idx: number;
  confidence: Confidence;
  warnings: string[];
  criteria_json: Record<string, never>;
  prizes: DraftPrize[];
}

interface DraftTeamGroup {
  name: string;
  group_by: string;
  team_size: number;
  confidence: "LOW";
  warnings: string[];
  prizes: DraftPrize[];
}

interface DraftResult {
  source: string;
  file_path: string;
  overall_confidence: Confidence;
  warnings: string[];
  categories: DraftCategory[];
  team_groups: DraftTeamGroup[];
}

type ParseMode = "extract" | "draft";
interface ParsedPage {
  pageIndex: number;
  text: string;
}

// ── Draft heuristic functions ────────────────────────────────────────────

const CURRENCY_RE = /(?:₹|Rs\.?\s*|INR\s*)([\d,]+)\s*\/?-?/gi;
const ORDINAL_SUFFIX_RE_SRC = String.raw`(?:st|nd|rd|th|ˢ\s*ᵗ|ⁿ\s*ᵈ|ʳ\s*ᵈ|ᵗ\s*ʰ)`;
const PLACE_SINGLE_RE = new RegExp(String.raw`(\d+)\s*${ORDINAL_SUFFIX_RE_SRC}\b`, "i");
const PLACE_RANGE_RE = new RegExp(String.raw`(\d+)\s*(?:${ORDINAL_SUFFIX_RE_SRC})?\s*[-–—]+\s*(\d+)\s*(?:${ORDINAL_SUFFIX_RE_SRC})`, "i");
const WINNER_RE = /\b(?:winner|1st)\b/i;
const RUNNER_RE = /\brunner[\s-]*up\b/i;

const MAIN_HEADING_RE = /\b(?:open\s+(?:category\s+)?(?:cash\s+)?prizes?|main\s+prizes?|cash\s+prizes?|overall\s+prizes?)\b/i;

const TEAM_HEADING_RE = /\b(?:best\s+(?:academy|school|club|institution|team)|team\s+(?:prizes?|championship))\b/i;
const TEAM_SIZE_RE = /\btop\s+(?:four|three|five|six|\d+)\b/i;
const TEAM_SIZE_MAP: Record<string, number> = {
  three: 3, four: 4, five: 5, six: 6,
};

const TROPHY_RE = /\btrophy\b/i;
const MEDAL_RE = /\bmedal\b/i;
const GIFT_RE = /\b(?:chess\s*set|voucher|gift|book|certificate|shield|memento)\b/gi;
const PRIZE_HEADING_RE = /\b(?:prize\s+structure|main\s+prize|category\s+prizes?|special\s+prize|elo\s+below)\b/i;
const PRIZE_PAGE_SIGNAL_RE = /\b(?:prize\s+structure|main\s+prize|special\s+prize|sub\s*category\s+prizes?|elo|rank|position|prize)\b/i;
const CATEGORY_LABEL_RE = /^(?:rated\s+\d{3,4}\s*[-–]\s*\d{3,4}|unrated|best\s+[a-z0-9+ -]+|under\s*\d{1,2}\s*(?:boys|girls)|u[-\s]?\d{1,2})\b/i;
const TROPHY_TOKEN_RE = /(?:\bT\b|\+?\s*TROPHY\b|🏆)/i;
const MEDAL_TOKEN_RE = /(?:\bM\b|\+?\s*MEDAL\b|🏅)/i;
const NOTE_ONLY_RE = /\b(?:for\s+all|participants?)\b/i;
const PLACE_ONLY_LINE_RE = /^\s*(\d{1,2})\s*$/;
const ORDINAL_CONTINUATION_RE = new RegExp(String.raw`^\s*(?:${ORDINAL_SUFFIX_RE_SRC})\b`, "i");
const PLACE_ORDINAL_ONLY_RE = new RegExp(String.raw`^\s*(\d{1,2})\s*(?:${ORDINAL_SUFFIX_RE_SRC})\s*$`, "i");
const ORDINAL_CURRENCY_OR_AWARD_RE = new RegExp(
  String.raw`^\s*(?:${ORDINAL_SUFFIX_RE_SRC})\b\s*(?:(?:₹|Rs\.?\s*|INR\s*)\d|.*\b(?:trophy|medal|gift|voucher|book|certificate|shield|memento)\b)`,
  "i",
);
const ORDINAL_TOKEN_RE = new RegExp(String.raw`\b\d+\s*(?:${ORDINAL_SUFFIX_RE_SRC})\b`, "i");

const AICF_HEADINGS: { regex: RegExp; name: string }[] = [
  { regex: /\bPRIZE\s+STRUCTURE\b/i, name: "Prize Structure" },
  { regex: /\bMAIN\s+PRIZE(?:S)?\b/i, name: "Main Prize" },
  { regex: /\bELO\s+BELOW\s*1600\b/i, name: "Elo Below 1600" },
  { regex: /\bELO\s+BELOW\s*1800\b/i, name: "Elo Below 1800" },
  { regex: /\bSPECIAL\s+PRIZE(?:S)?\b/i, name: "Special Prize" },
];
const NON_PRIZE_SECTION_RE = /\b(?:rules?|regulation|schedule|protest|contact|venue|entry\s+fee|registration|time\s+control|appeal|pairing|round)\b/i;

function parseCurrencyAmount(text: string): number | null {
  const m = text.match(/(?:₹|Rs\.?\s*|INR\s*)([\d,]+)\s*\/?-?/i);
  if (!m) return null;
  return parseInt(m[1].replace(/,/g, ""), 10) || null;
}

function parsePlaceFromLine(line: string): { places: number[]; isRange: boolean } | null {
  const ordinalAwareRange = new RegExp(
    String.raw`(?:^|[\s:])(\d+)\s*(?:${ORDINAL_SUFFIX_RE_SRC})?\s*(?:to|[-–—]+)\s*(\d+)\s*(?:${ORDINAL_SUFFIX_RE_SRC})?\b`,
    "i",
  );
  const rangeMatch = line.match(ordinalAwareRange) ?? line.match(PLACE_RANGE_RE);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    if (start > 0 && end >= start && end - start < 50) {
      const places: number[] = [];
      for (let i = start; i <= end; i++) places.push(i);
      return { places, isRange: true };
    }
  }

  const singleMatch = line.match(PLACE_SINGLE_RE);
  if (singleMatch) {
    const p = parseInt(singleMatch[1], 10);
    if (p > 0 && p < 200) return { places: [p], isRange: false };
  }
  const bareSingle = line.match(/(?:^|[\s:])(\d{1,2})(?=\s|$)/);
  if (bareSingle) {
    const p = parseInt(bareSingle[1], 10);
    if (p > 0 && p < 200) return { places: [p], isRange: false };
  }

  if (WINNER_RE.test(line)) return { places: [1], isRange: false };
  if (RUNNER_RE.test(line)) return { places: [2], isRange: false };

  return null;
}

function detectAwards(line: string): { has_trophy: boolean; has_medal: boolean; gift_items: string[] } {
  const has_trophy = TROPHY_RE.test(line) || TROPHY_TOKEN_RE.test(line);
  const has_medal = MEDAL_RE.test(line) || MEDAL_TOKEN_RE.test(line);
  const gift_items = [...new Set([...line.matchAll(GIFT_RE)].map((m) => m[0].trim().toLowerCase()))];
  return { has_trophy, has_medal, gift_items };
}

function normalizeSplitPrizeLines(lines: string[]): string[] {
  const isAwardOrCurrencyLine = (line: string): boolean => {
    if (!line) return false;
    return /(?:₹|Rs\.?\s*|INR\s*)\d/i.test(line) ||
      /\b(?:trophy|medal|gift|voucher|book|certificate|shield|memento)\b/i.test(line);
  };

  const merged: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const current = normalizeTextLine(lines[i]);
    if (!current) continue;

    const next = i + 1 < lines.length ? normalizeTextLine(lines[i + 1]) : "";
    const next2 = i + 2 < lines.length ? normalizeTextLine(lines[i + 2]) : "";
    const placeOnly = current.match(PLACE_ONLY_LINE_RE);

    if (
      placeOnly &&
      next &&
      ORDINAL_CONTINUATION_RE.test(next) &&
      !ORDINAL_TOKEN_RE.test(next) &&
      ORDINAL_CURRENCY_OR_AWARD_RE.test(next)
    ) {
      merged.push(`${placeOnly[1]}${next}`);
      i += 1;
      continue;
    }

    if (
      placeOnly &&
      next &&
      ORDINAL_CONTINUATION_RE.test(next) &&
      !ORDINAL_TOKEN_RE.test(next) &&
      next2 &&
      isAwardOrCurrencyLine(next2)
    ) {
      merged.push(`${placeOnly[1]}${next} ${next2}`);
      i += 2;
      continue;
    }

    if (PLACE_ORDINAL_ONLY_RE.test(current) && next && isAwardOrCurrencyLine(next)) {
      merged.push(`${current} ${next}`);
      i += 1;
      continue;
    }

    merged.push(current);
  }
  return merged;
}

function detectAicfHeading(line: string): string | null {
  const normalized = normalizeTextLine(line)
    .replace(/[:\-–—]+$/, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const compact = normalized.replace(/\s+/g, "");
  for (const heading of AICF_HEADINGS) {
    if (heading.regex.test(normalized) || heading.regex.test(compact)) return heading.name;
  }
  return null;
}

function parseShorthandAwards(line: string): { amount: number | null; has_trophy: boolean; has_medal: boolean } {
  const compact = normalizeTextLine(line).replace(/\s+/g, "");
  const combo = compact.match(/(\d[\d,]*)\+([TM])\b/i);
  if (combo) {
    return {
      amount: parseInt(combo[1].replace(/,/g, ""), 10) || 0,
      has_trophy: combo[2].toUpperCase() === "T",
      has_medal: combo[2].toUpperCase() === "M",
    };
  }

  if (/\bT\b/i.test(line) && !/\bM\b/i.test(line)) return { amount: 0, has_trophy: true, has_medal: false };
  if (/\bM\b/i.test(line) && !/\bT\b/i.test(line)) return { amount: 0, has_trophy: false, has_medal: true };
  return { amount: null, has_trophy: false, has_medal: false };
}

function parseKhasdarShorthandToken(token: string): { amount: number | null; has_trophy: boolean; has_medal: boolean } {
  const compact = normalizeTextLine(token).replace(/\s+/g, "").toUpperCase();
  const explicitCombo = compact.match(/^(\d[\d,]*)\+(T|M)$/);
  if (explicitCombo) {
    return {
      amount: parseInt(explicitCombo[1].replace(/,/g, ""), 10) || 0,
      has_trophy: explicitCombo[2] === "T",
      has_medal: explicitCombo[2] === "M",
    };
  }
  if (compact === "T") return { amount: 0, has_trophy: true, has_medal: false };
  if (compact === "M") return { amount: 0, has_trophy: false, has_medal: true };
  return { amount: null, has_trophy: false, has_medal: false };
}

function parseSpecialPrizeMatrix(blockBody: string): { name: string; prizes: DraftPrize[] }[] {
  const rows: { key: string; label: string }[] = [
    { key: "07", label: "Under 07" },
    { key: "09", label: "Under 09" },
    { key: "11", label: "Under 11" },
    { key: "13", label: "Under 13" },
    { key: "15", label: "Under 15" },
  ];

  const result: { name: string; prizes: DraftPrize[] }[] = [];
  const lines = normalizeSplitPrizeLines(blockBody.split("\n"));
  const seen = new Set<string>();
  const underBucketRe = /(?:\bu|under)\s*[-:]?\s*0?(\d{1,2})\b/i;
  const ordinal123Re = new RegExp(String.raw`\b(?:1\s*${ORDINAL_SUFFIX_RE_SRC}|2\s*${ORDINAL_SUFFIX_RE_SRC}|3\s*${ORDINAL_SUFFIX_RE_SRC})\b`, "gi");

  // Row-level extraction first (higher confidence).
  for (const line of lines) {
    const normalized = normalizeTextLine(line);
    if (!normalized) continue;

    const rowMatch = normalized.match(underBucketRe);
    const bucket = rowMatch ? rowMatch[1].padStart(2, "0") : null;
    const row = bucket ? rows.find(({ key }) => key === bucket) : null;
    if (!row) continue;

    const ordinalMatches = [...normalized.matchAll(ordinal123Re)].map((m) => m[0].toLowerCase());
    const trophyCount = [...normalized.matchAll(/\btrophy\b/gi)].length;
    const placeCount = Math.min(3, Math.max(ordinalMatches.length, trophyCount));
    if (placeCount < 3) continue;

    const prizes: DraftPrize[] = [1, 2, 3].map((place) => ({
      place,
      cash_amount: 0,
      has_trophy: true,
      has_medal: false,
      gift_items: [],
      confidence: "HIGH",
      source_text: normalized.slice(0, 200),
    }));

    seen.add(row.key);
    result.push({ name: row.label, prizes });
  }

  // Deterministic block-level fallback for split/flattened matrices.
  const rankSignals = new Set<number>();
  if (new RegExp(String.raw`\b1\s*${ORDINAL_SUFFIX_RE_SRC}\b`, "i").test(blockBody)) rankSignals.add(1);
  if (new RegExp(String.raw`\b2\s*${ORDINAL_SUFFIX_RE_SRC}\b`, "i").test(blockBody)) rankSignals.add(2);
  if (new RegExp(String.raw`\b3\s*${ORDINAL_SUFFIX_RE_SRC}\b`, "i").test(blockBody)) rankSignals.add(3);
  if (rankSignals.size < 3) {
    if (/\b1\b/.test(blockBody)) rankSignals.add(1);
    if (/\b2\b/.test(blockBody)) rankSignals.add(2);
    if (/\b3\b/.test(blockBody)) rankSignals.add(3);
  }

  const detectedBuckets = new Set<string>();
  for (const match of blockBody.matchAll(/(?:\bu|under)\s*[-:]?\s*0?(\d{1,2})\b/gi)) {
    const bucket = match[1].padStart(2, "0");
    if (rows.some((row) => row.key === bucket)) detectedBuckets.add(bucket);
  }

  const hasTrophySignal = /\b(?:trophy|trophies)\b/i.test(blockBody) || TROPHY_TOKEN_RE.test(blockBody);
  const canReconstruct = hasTrophySignal && rankSignals.has(1) && rankSignals.has(2) && rankSignals.has(3);
  if (canReconstruct) {
    for (const row of rows) {
      if (!detectedBuckets.has(row.key) || seen.has(row.key)) continue;
      result.push({
        name: row.label,
        prizes: [1, 2, 3].map((place) => ({
          place,
          cash_amount: 0,
          has_trophy: true,
          has_medal: false,
          gift_items: [],
          confidence: "MEDIUM",
          source_text: "Reconstructed from special prize matrix block",
        })),
      });
    }
  }

  return result;
}

function parseAicfBlocks(text: string): { name: string; prizes: DraftPrize[]; confidence: Confidence; blockKey: string }[] {
  const lines = text.split("\n");
  const prizeStructureAnchor = lines.findIndex((line) => /\bPRIZE\s+STRUCTURE\b/i.test(normalizeTextLine(line)));
  const startIndex = prizeStructureAnchor >= 0 ? prizeStructureAnchor : 0;
  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i++) {
    const normalized = normalizeTextLine(lines[i]);
    if (!normalized) continue;
    if (NON_PRIZE_SECTION_RE.test(normalized) && !detectAicfHeading(normalized)) {
      endIndex = i;
      break;
    }
  }
  const anchored = lines.slice(startIndex, endIndex);
  const headings: { idx: number; name: string }[] = [];
  for (let i = 0; i < anchored.length; i++) {
    const heading = detectAicfHeading(anchored[i]);
    if (!heading || heading === "Prize Structure") continue;
    headings.push({ idx: i, name: heading });
  }

  if (headings.length === 0) return [];

  const parsed: { name: string; prizes: DraftPrize[]; confidence: Confidence; blockKey: string }[] = [];
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const start = heading.idx + 1;
    const end = i + 1 < headings.length ? headings[i + 1].idx : anchored.length;
    const body = anchored.slice(start, end).join("\n").trim();
    if (!body) continue;

    if (heading.name === "Special Prize") {
      const matrix = parseSpecialPrizeMatrix(body);
      for (const row of matrix) {
        parsed.push({
          name: row.name,
          prizes: row.prizes,
          confidence: "MEDIUM",
          blockKey: `aicf-special-${normalizeSectionName(row.name)}`,
        });
      }
      continue;
    }

    const prizes = parsePrizeLinesFromBlock(body);
    if (!hasMinimumPrizeSignal(body, prizes)) continue;
    parsed.push({
      name: heading.name,
      prizes,
      confidence: prizes.some((p) => p.confidence === "HIGH") ? "HIGH" : "MEDIUM",
      blockKey: `aicf-${normalizeSectionName(heading.name)}`,
    });
  }

  return parsed;
}

function parsePrizeLinesFromBlock(block: string): DraftPrize[] {
  const lines = normalizeSplitPrizeLines(block.split("\n"));
  const prizes: DraftPrize[] = [];
  let pendingPlace: number | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.length < 3) continue;

    if (NOTE_ONLY_RE.test(line) && !parseCurrencyAmount(line) && !parsePlaceFromLine(line)) {
      continue;
    }

    const placeResult = parsePlaceFromLine(line);
    const amount = parseCurrencyAmount(line);
    const awards = detectAwards(line);
    const shorthand = parseShorthandAwards(line);
    const resolvedAmount = amount ?? shorthand.amount;
    const resolvedAwards = {
      has_trophy: awards.has_trophy || shorthand.has_trophy,
      has_medal: awards.has_medal || shorthand.has_medal,
      gift_items: awards.gift_items,
    };

    if (!placeResult && resolvedAmount === null && !resolvedAwards.has_trophy && !resolvedAwards.has_medal && resolvedAwards.gift_items.length === 0) {
      continue;
    }

    if (placeResult && placeResult.places.length === 1 && resolvedAmount === null && !resolvedAwards.has_trophy && !resolvedAwards.has_medal) {
      pendingPlace = placeResult.places[0];
      continue;
    }

    if (!placeResult && pendingPlace !== null && (resolvedAmount !== null || resolvedAwards.has_trophy || resolvedAwards.has_medal)) {
      prizes.push({
        place: pendingPlace,
        cash_amount: resolvedAmount ?? 0,
        has_trophy: resolvedAwards.has_trophy,
        has_medal: resolvedAwards.has_medal,
        gift_items: resolvedAwards.gift_items,
        confidence: resolvedAmount !== null ? "MEDIUM" : "LOW",
        source_text: `${pendingPlace} ${line}`.slice(0, 200),
      });
      pendingPlace = null;
      continue;
    }

    if (placeResult) {
      const hasAwardSignal = resolvedAwards.has_trophy || resolvedAwards.has_medal || resolvedAwards.gift_items.length > 0;
      const isAccepted = resolvedAmount !== null || hasAwardSignal;
      if (!isAccepted) continue;

      const cashAmount = resolvedAmount ?? 0;
      const confidence: Confidence = (resolvedAmount !== null && !placeResult.isRange) ? "HIGH"
        : (resolvedAmount !== null && placeResult.isRange) ? "MEDIUM"
        : "LOW";

      for (const place of placeResult.places) {
        prizes.push({
          place,
          cash_amount: cashAmount,
          has_trophy: resolvedAwards.has_trophy,
          has_medal: resolvedAwards.has_medal,
          gift_items: resolvedAwards.gift_items,
          confidence,
          source_text: line.slice(0, 200),
        });
      }
      pendingPlace = null;
    } else if (resolvedAmount !== null) {
      // Amount found but no place — skip (can't assign without a place)
    }
  }

  return prizes;
}

function splitPages(text: string, pageCount: number): string[] {
  const rawPages = text.split(/\f+/).map((page) => page.trim()).filter((page) => page.length > 0);
  if (rawPages.length > 0) return rawPages;
  if (pageCount <= 1) return [text];
  return [text];
}

function toParsedPages(text: string, pageCount: number): ParsedPage[] {
  return splitPages(text, pageCount).map((pageText, index) => ({
    pageIndex: index,
    text: pageText,
  }));
}

function scorePrizePage(pageText: string): number {
  const lines = pageText.split("\n").map((line) => normalizeTextLine(line)).filter(Boolean);
  const headingHits = lines.filter((line) => PRIZE_HEADING_RE.test(line) || PRIZE_PAGE_SIGNAL_RE.test(line)).length;
  const currencyHits = lines.filter((line) => /(?:₹|Rs\.?\s*|INR\s*)\d/i.test(line)).length;
  const bareAmountHits = lines.filter((line) => /\b\d{3,5}\b/.test(line) && (line.match(/\b\d{3,5}\b/g) ?? []).length >= 2).length;
  const placeHits = lines.filter((line) => parsePlaceFromLine(line) !== null).length;
  const repeatedRankHits = lines.filter((line) => /^(?:\d{1,2}\s+){3,}\d{1,2}$/.test(line)).length;
  const categoryHits = lines.filter((line) => CATEGORY_LABEL_RE.test(line)).length;
  return headingHits * 6 + currencyHits * 2 + bareAmountHits * 2 + placeHits * 2 + repeatedRankHits * 3 + categoryHits;
}

function selectPrizeRelevantPages(pages: ParsedPage[]): ParsedPage[] {
  if (pages.length <= 1) return pages;
  const scored = pages.map((page) => ({ ...page, score: scorePrizePage(page.text) }));
  const strong = scored.filter((page) => page.score >= 10);
  if (strong.length > 0) return strong.map(({ pageIndex, text }) => ({ pageIndex, text }));
  const fallback = scored.filter((page) => page.score >= 6);
  if (fallback.length > 0) return fallback.map(({ pageIndex, text }) => ({ pageIndex, text }));
  return pages;
}

function isolateEventPages(
  pages: ParsedPage[],
  selectedEvent: string,
  events: string[],
): { text: string | null; isolated: ParsedPage[] } {
  if (pages.length === 0) return { text: null, isolated: [] };

  const selectedRegex = new RegExp(`\\b${selectedEvent}\\b`, "i");
  const otherRegexes = events
    .filter((event) => event.toLowerCase() !== selectedEvent.toLowerCase())
    .map((event) => new RegExp(`\\b${event}\\b`, "i"));

  const scored = pages.map((page) => {
    const normalizedText = normalizeTextLine(page.text);
    const prizeScore = scorePrizePage(page.text);
    const hasSelected = selectedRegex.test(normalizedText);
    const hasOther = otherRegexes.some((regex) => regex.test(normalizedText));
    return { ...page, prizeScore, hasSelected, hasOther };
  });

  const selectedCandidates = scored.filter((page) => page.hasSelected);
  if (selectedCandidates.length === 0) return { text: null, isolated: [] };

  const anchor = [...selectedCandidates].sort((a, b) => {
    const aScore = a.prizeScore + (a.hasOther ? -2 : 2);
    const bScore = b.prizeScore + (b.hasOther ? -2 : 2);
    return bScore - aScore;
  })[0];

  let start = anchor.pageIndex;
  let end = pages.length - 1;

  for (let i = anchor.pageIndex + 1; i < scored.length; i++) {
    if (scored[i].hasOther && scored[i].prizeScore >= 6) {
      end = i - 1;
      break;
    }
  }

  if (anchor.hasOther) {
    // Event overview page can mention multiple events; avoid bleeding into prior event pages.
    start = anchor.pageIndex;
  }

  if (end < start) {
    return { text: null, isolated: [] };
  }

  const isolated = pages.filter((page) => page.pageIndex >= start && page.pageIndex <= end);
  const isolatedText = isolated.map((page) => page.text).join("\n").trim();
  return { text: isolatedText.length > 0 ? isolatedText : null, isolated };
}

function isolateEventBlocks(
  pages: ParsedPage[],
  selectedEvent: string,
  events: string[],
): { text: string | null; isolated: ParsedPage[] } {
  if (pages.length === 0) return { text: null, isolated: [] };

  const selectedRegex = new RegExp(`\\b${selectedEvent}\\b`, "i");
  const otherRegexes = events
    .filter((event) => event.toLowerCase() !== selectedEvent.toLowerCase())
    .map((event) => new RegExp(`\\b${event}\\b`, "i"));

  const pageScores = pages.map((page) => {
    const lines = page.text.split("\n").map((line) => normalizeTextLine(line)).filter(Boolean);
    const selectedHits = lines.filter((line) => selectedRegex.test(line)).length;
    const otherHits = lines.filter((line) => otherRegexes.some((regex) => regex.test(line))).length;
    return { page, selectedHits, otherHits, prizeScore: scorePrizePage(page.text) };
  });

  const selectedPages = pageScores.filter((entry) => entry.selectedHits > 0 && entry.selectedHits >= entry.otherHits);
  if (selectedPages.length === 0) return { text: null, isolated: [] };

  const isolated = selectedPages.map((entry) => entry.page);
  const isolatedText = isolated.map((page) => page.text).join("\n").trim();
  return { text: isolatedText.length > 0 ? isolatedText : null, isolated };
}

function extractCategoryNameFromLine(line: string): string | null {
  const normalized = normalizeTextLine(line)
    .replace(/\s*[:|-]\s*$/, "")
    .replace(/\b(?:prizes?|category)\b$/i, "")
    .trim();
  if (!normalized) return null;
  if (normalized.length > 80) return null;
  if (!CATEGORY_LABEL_RE.test(normalized) && !/\belo\s+below\b/i.test(normalized)) return null;
  return normalized;
}

function splitSectionIntoSubcategories(sectionName: string, body: string): { name: string; body: string }[] {
  if (!/\b(?:category|special|elo\s+below)\b/i.test(sectionName)) {
    return [{ name: sectionName, body }];
  }

  const lines = body.split("\n");
  const subSections: { name: string; startIdx: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const candidate = extractCategoryNameFromLine(lines[i]);
    if (!candidate) continue;
    subSections.push({ name: candidate, startIdx: i });
  }

  if (subSections.length === 0) return [{ name: sectionName, body }];

  const result: { name: string; body: string }[] = [];
  for (let s = 0; s < subSections.length; s++) {
    const start = subSections[s].startIdx + 1;
    const end = s + 1 < subSections.length ? subSections[s + 1].startIdx : lines.length;
    const subBody = lines.slice(start, end).join("\n").trim();
    if (!subBody) continue;
    result.push({ name: subSections[s].name, body: subBody });
  }
  return result.length > 0 ? result : [{ name: sectionName, body }];
}

function detectSections(text: string, pageIndex: number): { name: string; body: string; isMain: boolean; isTeam: boolean; blockKey: string; pageIndex: number }[] {
  const lines = text.split("\n");
  const sections: { name: string; startIdx: number; isMain: boolean; isTeam: boolean }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = normalizeTextLine(lines[i]);
    if (!line || line.length > 80) continue;

    // Check if this line looks like a heading (short, no currency, possibly uppercase)
    const hasCurrency = CURRENCY_RE.test(line);
    CURRENCY_RE.lastIndex = 0; // reset regex state

    if (hasCurrency) continue;

    const isMain = MAIN_HEADING_RE.test(line);
    const isTeam = TEAM_HEADING_RE.test(line);
    if (NON_PRIZE_SECTION_RE.test(line) && !isMain && !isTeam && !PRIZE_PAGE_SIGNAL_RE.test(line)) continue;

    // A heading candidate: short line without currency that has some alphabetic content
    const hasAlpha = /[a-zA-Z]{3,}/.test(line);
    if (!hasAlpha) continue;
    if (/^[A-Z]{12,}$/.test(line)) continue;
    if (/[a-z]+[A-Z][a-z]+/.test(line)) continue;
    if (/^(?:u\d{2}|[a-e])\s*-\s*(?:\d{3,4}|\d{2,3}\s*-\s*\d{2,3})$/i.test(line)) continue;
    if ((line.match(/\d+/g) ?? []).length >= 4) continue;
    if ((line.match(/[A-Za-z]+/g) ?? []).some((token) => token.length > 24)) continue;

    // Check if next ~10 lines contain currency (this heading precedes prizes)
    let hasPrizesBelow = false;
    for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
      if (/(?:₹|Rs\.?\s*|INR\s*)\d/i.test(lines[j]) || PLACE_SINGLE_RE.test(lines[j])) {
        hasPrizesBelow = true;
        break;
      }
    }

    if (hasPrizesBelow || isMain || isTeam) {
      sections.push({ name: line, startIdx: i, isMain, isTeam });
    }
  }

  // Build body text for each section (from heading to next heading or EOF, capped at 2000 chars)
  const result: { name: string; body: string; isMain: boolean; isTeam: boolean; blockKey: string; pageIndex: number }[] = [];
  for (let s = 0; s < sections.length; s++) {
    const startLine = sections[s].startIdx + 1;
    const endLine = s + 1 < sections.length ? sections[s + 1].startIdx : lines.length;
    const body = lines.slice(startLine, endLine).join("\n").slice(0, 2000);
    result.push({
      name: sections[s].name,
      body,
      isMain: sections[s].isMain,
      isTeam: sections[s].isTeam,
      blockKey: `page-${pageIndex}-line-${sections[s].startIdx}`,
      pageIndex,
    });
  }

  return result;
}

function parseTeamSize(text: string): number {
  const m = text.match(TEAM_SIZE_RE);
  if (!m) return 4; // default
  const word = m[0].replace(/^top\s+/i, "").toLowerCase();
  if (TEAM_SIZE_MAP[word]) return TEAM_SIZE_MAP[word];
  const num = parseInt(word, 10);
  return num > 0 && num < 20 ? num : 4;
}

function sliceTextForEvent(text: string, selectedEvent: string, events: string[]): string | null {
  const lines = text.split("\n");
  const eventRegexes = events.map((event) => ({
    event,
    regex: new RegExp(`\\b${event}\\b`, "i"),
  }));

  let startIdx = -1;
  const selectedLower = selectedEvent.toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeTextLine(lines[i]);
    if (!line || line.length > 100) continue;
    if (!eventRegexes.some(({ regex }) => regex.test(line))) continue;
    const selectedRegex = eventRegexes.find(({ event }) => event.toLowerCase() === selectedLower)?.regex;
    if (selectedRegex && selectedRegex.test(line)) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return null;

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = normalizeTextLine(lines[i]);
    if (!line || line.length > 100) continue;
    for (const { event, regex } of eventRegexes) {
      if (event.toLowerCase() === selectedLower) continue;
      if (regex.test(line)) {
        endIdx = i;
        break;
      }
    }
    if (endIdx !== lines.length) break;
  }

  const sliced = lines.slice(startIdx, endIdx).join("\n").trim();
  return sliced.length > 0 ? sliced : null;
}

function detectGridGenderContext(contextLines: string[]): "Boys" | "Girls" | null {
  const joined = normalizeTextLine(contextLines.join(" "));
  if (!joined) return null;
  const hasBoys = /\bboys?\b/i.test(joined);
  const hasGirls = /\bgirls?\b/i.test(joined);
  if (hasBoys && !hasGirls) return "Boys";
  if (hasGirls && !hasBoys) return "Girls";
  return null;
}

function splitGridHeaderCategories(headerLines: string[], genderContext: "Boys" | "Girls" | null = null): string[] {
  const joined = normalizeTextLine(headerLines.map((line) => line.replace(/^rank\b/i, "")).join(" "));
  if (!joined) return [];

  const explicit: string[] = [];
  const add = (name: string) => {
    const normalized = normalizeTextLine(name);
    if (!normalized) return;
    if (!explicit.some((item) => normalizeSectionName(item) === normalizeSectionName(normalized))) {
      explicit.push(normalized);
    }
  };

  if (/\bmain(?:\s+prizes?)?\b/i.test(joined)) add("Main Prize");
  for (const match of joined.matchAll(/\b(\d{3,4}\s*[-–]\s*\d{3,4})\b/gi)) add(match[1].replace(/\s*[-–]\s*/g, "-"));
  if (/\bunrated\b/i.test(joined)) add("Unrated");
  if (/\bdelhi\b/i.test(joined)) add("Delhi");
  if (/\bfemale\b/i.test(joined)) add("Female");
  const veteranMatches = [...joined.matchAll(/\bveteran\s*(\d{2})\+?\b/gi)];
  if (veteranMatches.length > 0) {
    for (const match of veteranMatches) add(`Veteran ${match[1]}+`);
  } else if (/\bveteran\b/i.test(joined)) {
    add("Veteran 55+");
  }
  if (/\bspecially\s*abled\b/i.test(joined)) add("Specially Abled");
  if (/\b(?:diff(?:erently)?\.?\s*abled|disabled)\b/i.test(joined)) add("Diff. Abled");

  const standaloneUnderAges = [...joined.matchAll(/\b(?:under|u[-\s]?)\s*0?(\d{1,2})\b/gi)]
    .map((m) => parseInt(m[1], 10))
    .filter((age) => age > 0 && age < 25);
  for (const age of [...new Set(standaloneUnderAges)]) {
    add(`${genderContext ?? ""}${genderContext ? " " : ""}Under ${age}`);
  }

  const extractChildCategories = (label: "Boys" | "Girls") => {
    const sectionPattern = label === "Boys"
      ? /\bboys?\b([\s\S]*?)(?=\bgirls?\b|$)/i
      : /\bgirls?\b([\s\S]*?)$/i;
    const section = joined.match(sectionPattern)?.[1] ?? "";
    const ages = [...section.matchAll(/\b(?:under|u[-\s]?)\s*0?(\d{1,2})\b/gi)].map((m) => parseInt(m[1], 10));
    const uniqueAges = [...new Set(ages)].filter((age) => age > 0 && age < 25);
    for (const age of uniqueAges) add(`${label} Under ${age}`);
  };

  extractChildCategories("Boys");
  extractChildCategories("Girls");

  if (/best\s+academy/i.test(joined)) add("Best Academy");
  if (/best\s+school/i.test(joined)) add("Best School");

  return explicit;
}

function parseGridPrizeRows(lines: string[], categoryCount: number): Map<number, { amount: number; has_trophy: boolean; has_medal: boolean }[]> {
  const rows = new Map<number, { amount: number; has_trophy: boolean; has_medal: boolean }[]>();
  for (const rawLine of lines) {
    const line = normalizeTextLine(rawLine);
    if (!line) continue;
    const placeResult = parsePlaceFromLine(line);
    if (!placeResult || placeResult.places.length === 0) continue;
    const amounts = [...line.matchAll(/(?:₹|Rs\.?\s*|INR\s*)?\s*([\d,]{3,7})\b/g)]
      .map((m) => parseInt(m[1].replace(/,/g, ""), 10))
      .filter((n) => Number.isFinite(n) && n >= 100);
    const awards = detectAwards(line);
    const hasAwardOnly = amounts.length === 0 && (awards.has_trophy || awards.has_medal);
    const cols = Array.from({ length: categoryCount }, (_, idx) => ({
      amount: amounts[idx] ?? 0,
      has_trophy: awards.has_trophy,
      has_medal: awards.has_medal,
    }));
    if (!hasAwardOnly && amounts.length === 0) continue;
    for (const place of placeResult.places) {
      rows.set(place, cols);
    }
  }
  return rows;
}

function parseGridBlocksFromPage(page: ParsedPage): {
  categories: { name: string; confidence: Confidence; blockKey: string; prizes: DraftPrize[] }[];
  teamGroups: { name: string; blockKey: string; prizes: DraftPrize[] }[];
  warnings: string[];
} {
  const lines = page.text.split("\n");
  const warnings: string[] = [];
  const categories: { name: string; confidence: Confidence; blockKey: string; prizes: DraftPrize[] }[] = [];
  const teamGroups: { name: string; blockKey: string; prizes: DraftPrize[] }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = normalizeTextLine(lines[i]);
    if (!line) continue;

    if (/youngest\s+kid/i.test(line)) {
      warnings.push(`Unstructured special award note on page ${page.pageIndex + 1}: ${line}`);
    }

    if (!/rank/i.test(line)) continue;
    const headerLines = [line];
    for (let h = i + 1; h < Math.min(i + 4, lines.length); h++) {
      const headerContinuation = normalizeTextLine(lines[h]);
      if (!headerContinuation) continue;
      if (parsePlaceFromLine(headerContinuation)) break;
      if (/^rank\b/i.test(headerContinuation)) break;
      headerLines.push(headerContinuation);
    }
    const contextLines = lines.slice(Math.max(0, i - 3), i).map((candidate) => normalizeTextLine(candidate)).filter(Boolean);
    const genderContext = detectGridGenderContext([...contextLines, ...headerLines]);
    const headerCategories = splitGridHeaderCategories(headerLines, genderContext);
    if (headerCategories.length < 2) continue;

    const bodyLines: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const nextLine = normalizeTextLine(lines[j]);
      if (!nextLine) {
        if (bodyLines.length > 0) break;
        continue;
      }
      if (/^rank\b/i.test(nextLine)) break;
      if (/(?:rapid|blitz)\b/i.test(nextLine) && scorePrizePage(nextLine) < 2) break;
      bodyLines.push(nextLine);
      if (bodyLines.length >= 15) break;
    }

    const rowMap = parseGridPrizeRows(bodyLines, headerCategories.length);
    if (rowMap.size === 0) continue;

    for (let c = 0; c < headerCategories.length; c++) {
      const categoryName = headerCategories[c];
      const isTeam = /^best\s+(academy|school)$/i.test(categoryName);
      const prizes: DraftPrize[] = [];
      for (const [place, cols] of rowMap.entries()) {
        const col = cols[c];
        if (!col) continue;
        if (col.amount <= 0 && !col.has_trophy && !col.has_medal) continue;
        prizes.push({
          place,
          cash_amount: col.amount,
          has_trophy: col.has_trophy,
          has_medal: col.has_medal,
          gift_items: [],
          confidence: "MEDIUM",
          source_text: `grid page ${page.pageIndex + 1} row ${place}`,
        });
      }
      if (prizes.length === 0) continue;

      const blockKey = `grid-page-${page.pageIndex}-header-${i}-col-${c}`;
      if (isTeam) {
        teamGroups.push({
          name: categoryName,
          blockKey,
          prizes,
        });
      } else {
        categories.push({
          name: categoryName,
          confidence: "MEDIUM",
          blockKey,
          prizes,
        });
      }
    }
  }

  return { categories, teamGroups, warnings };
}

function parseKhasdarBlocks(text: string): {
  categories: { name: string; prizes: DraftPrize[]; confidence: Confidence; blockKey: string }[];
  teamGroups: { name: string; prizes: DraftPrize[]; blockKey: string }[];
  warnings: string[];
} {
  const normalizedText = normalizeTextLine(text);
  if (!/\btotal\s+prize\s+fund\b/i.test(normalizedText) && !/\bkhasdar\b/i.test(normalizedText)) {
    return { categories: [], teamGroups: [], warnings: [] };
  }

  const lines = normalizeSplitPrizeLines(text.split("\n"));
  const categories: { name: string; prizes: DraftPrize[]; confidence: Confidence; blockKey: string }[] = [];
  const teamGroups: { name: string; prizes: DraftPrize[]; blockKey: string }[] = [];
  const warnings: string[] = [];

  const pushCategory = (name: string, prizes: DraftPrize[], confidence: Confidence, blockKey: string) => {
    if (prizes.length === 0) return;
    categories.push({ name, prizes, confidence, blockKey });
  };

  const khasdarRatingRangeRe = /\b(1401|1501|1601|1701|1801|1901)\s*(?:[-–—]|to)\s*(1500|1600|1700|1800|1900|2000)\b/gi;
  const hasKhasdarPrizeGridSignal = /\b(?:main\s*prize|winner|runner\s*up|best\s+unrated|best\s+sangli|under\s*0?\d{1,2}|u[-\s]?\d{1,2}|1401\s*(?:[-–—]|to)\s*1500)\b/i
    .test(lines.join(" "));

  // MAIN PRIZES (rank 1..25)
  const mainRows = lines.filter((line) => /^\s*(?:\d{1,2})(?:st|nd|rd|th)?\b/i.test(line));
  const mainPrizes: DraftPrize[] = [];
  for (const line of mainRows) {
    const place = parsePlaceFromLine(line)?.places[0];
    if (!place || place > 25) continue;
    const shorthand = parseKhasdarShorthandToken(line);
    const amount = parseCurrencyAmount(line) ?? shorthand.amount;
    const hasPrizeSignal = amount !== null || shorthand.has_trophy || shorthand.has_medal;
    if (!hasPrizeSignal) continue;
    mainPrizes.push({
      place,
      cash_amount: amount ?? 0,
      has_trophy: place <= 8 || shorthand.has_trophy,
      has_medal: place >= 9 || shorthand.has_medal,
      gift_items: [],
      confidence: "MEDIUM",
      source_text: line.slice(0, 200),
    });
  }
  if (hasKhasdarPrizeGridSignal) {
    pushCategory("Main Prize", mainPrizes, "MEDIUM", "khasdar-main-prize");
  }

  const linesText = lines.join("\n");

  // Rating slabs with Winner / Runner Up
  const ratingRanges = [...text.matchAll(khasdarRatingRangeRe)].map((m) =>
    `${m[1]}-${m[2]}`);
  const uniqueRanges = [...new Set(ratingRanges)].filter((name) => /^(1401-1500|1501-1600|1601-1700|1701-1800|1801-1900|1901-2000)$/.test(name));
  for (const range of uniqueRanges) {
    const [start, end] = range.split("-");
    const rangeMatcher = new RegExp(`${start}\\s*(?:[-–—]|to)\\s*${end}[\\s\\S]{0,260}`, "i");
    const snippet = text.match(rangeMatcher)?.[0] ?? range;
    const winnerLine = snippet.match(/(?:winner|1st)[^\n]*/i)?.[0] ?? "";
    const runnerLine = snippet.match(/(?:runner\s*up|2nd)[^\n]*/i)?.[0] ?? "";
    const winnerToken = winnerLine.match(/\b\d[\d,]*\s*\+\s*[TM]\b/i)?.[0] ?? winnerLine.match(/\bT\b/i)?.[0] ?? winnerLine.match(/\bM\b/i)?.[0] ?? "";
    const runnerToken = runnerLine.match(/\b\d[\d,]*\s*\+\s*[TM]\b/i)?.[0] ?? runnerLine.match(/\bT\b/i)?.[0] ?? runnerLine.match(/\bM\b/i)?.[0] ?? "";
    const winner = parseKhasdarShorthandToken(winnerToken);
    const runner = parseKhasdarShorthandToken(runnerToken);
    pushCategory(range, [
      { place: 1, cash_amount: winner.amount ?? 0, has_trophy: winner.has_trophy, has_medal: winner.has_medal, gift_items: [], confidence: "MEDIUM", source_text: `${range} Winner` },
      { place: 2, cash_amount: runner.amount ?? 0, has_trophy: runner.has_trophy, has_medal: runner.has_medal, gift_items: [], confidence: "MEDIUM", source_text: `${range} Runner Up` },
    ], "MEDIUM", `khasdar-slab-${range}`);
  }

  // Age matrix rows, parse shorthand tokens only when present.
  for (const age of [7, 9, 11, 13, 15, 17]) {
    const rowRegex = new RegExp(`(?:u[-\\s]?0?${age}|under\\s*0?${age})[^\\n]{0,180}`, "i");
    const row = linesText.match(rowRegex)?.[0];
    if (!row) continue;
    const name = `Under ${String(age).padStart(2, "0")}`;
    const prizes: DraftPrize[] = [];
    const combos = [...row.matchAll(/(\d[\d,]*)\+([TM])/gi)];
    for (let place = 1; place <= 10; place++) {
      const combo = combos[place - 1];
      const token = combo ? `${combo[1]}+${combo[2]}` : (place >= 4 && /\bM\b/i.test(row) ? "M" : place === 1 && /\bT\b/i.test(row) ? "T" : "");
      const parsed = parseKhasdarShorthandToken(token);
      if (parsed.amount === null && !parsed.has_trophy && !parsed.has_medal) continue;
      prizes.push({ place, cash_amount: parsed.amount ?? 0, has_trophy: parsed.has_trophy, has_medal: parsed.has_medal, gift_items: [], confidence: "LOW", source_text: `${name} ${token}` });
    }
    if (prizes.length < 3) {
      warnings.push(`Could not reliably parse full row for ${name}`);
      continue;
    }
    pushCategory(name, prizes, "LOW", `khasdar-age-${age}`);
  }

  for (const special of ["BEST UNRATED-M", "BEST UNRATED-F", "BEST SANGLI-M", "BEST SANGLI-F"]) {
    const specialRow = linesText.match(new RegExp(`${special.replace(/-/g, "[-\\s]?")}[^\\n]{0,220}`, "i"))?.[0];
    if (!specialRow) continue;
    const prizes: DraftPrize[] = [];
    for (let place = 1; place <= 7; place++) {
      const combo = [...specialRow.matchAll(/(\d[\d,]*)\+([TM])/gi)][place - 1];
      const token = combo ? `${combo[1]}+${combo[2]}` : (place >= 3 && /\bM\b/i.test(specialRow) ? "M" : place === 1 && /\bT\b/i.test(specialRow) ? "T" : "");
      const parsed = parseKhasdarShorthandToken(token);
      if (parsed.amount === null && !parsed.has_trophy && !parsed.has_medal) continue;
      prizes.push({ place, cash_amount: parsed.amount ?? 0, has_trophy: parsed.has_trophy, has_medal: parsed.has_medal, gift_items: [], confidence: "LOW", source_text: `${special} ${token}` });
    }
    if (prizes.length < 2) continue;
    pushCategory(special, prizes, "LOW", `khasdar-special-${normalizeSectionName(special)}`);
  }

  const veterenRow = linesText.match(/\bbest\s+veter[ae]n\b[^\n]{0,220}/i)?.[0];
  if (veterenRow) {
    const first = parseKhasdarShorthandToken([...veterenRow.matchAll(/(\d[\d,]*)\+([TM])/gi)][0]?.[0] ?? "T");
    const second = parseKhasdarShorthandToken([...veterenRow.matchAll(/(\d[\d,]*)\+([TM])/gi)][1]?.[0] ?? "M");
    pushCategory("Best Veteren", [
      { place: 1, cash_amount: first.amount ?? 0, has_trophy: first.has_trophy || /\bT\b/i.test(veterenRow), has_medal: false, gift_items: [], confidence: "LOW", source_text: "Best Veteren parsed" },
      { place: 2, cash_amount: second.amount ?? 0, has_trophy: false, has_medal: second.has_medal || /\bM\b/i.test(veterenRow), gift_items: [], confidence: "LOW", source_text: "Best Veteren parsed" },
    ], "LOW", "khasdar-best-veteren");
  }
  if (/\bbest\s+female\b/i.test(text)) {
    pushCategory("Best Female", [
      { place: 1, cash_amount: 0, has_trophy: true, has_medal: false, gift_items: [], confidence: "LOW", source_text: "Best Female reconstructed" },
      { place: 2, cash_amount: 0, has_trophy: true, has_medal: false, gift_items: [], confidence: "LOW", source_text: "Best Female reconstructed" },
    ], "LOW", "khasdar-best-female");
  }

  if (/\bbest\s+academy\b/i.test(text)) {
    teamGroups.push({
      name: "Best Academy",
      blockKey: "khasdar-best-academy",
      prizes: [{ place: 1, cash_amount: 0, has_trophy: true, has_medal: false, gift_items: [], confidence: "LOW", source_text: "Best Academy trophy" }],
    });
    warnings.push("Best Academy parsed as low-confidence team group");
  }

  return { categories, teamGroups, warnings };
}

function hasMinimumPrizeSignal(sectionBody: string, prizes: DraftPrize[]): boolean {
  if (prizes.length === 0) return false;
  const lines = sectionBody.split("\n").map((line) => normalizeTextLine(line)).filter(Boolean);
  const currencyLines = lines.filter((line) => /(?:₹|Rs\.?\s*|INR\s*)\d/i.test(line)).length;
  const awardLines = lines.filter((line) => detectAwards(line).has_trophy || detectAwards(line).has_medal).length;
  const placeLines = lines.filter((line) => parsePlaceFromLine(line) !== null).length;
  return (currencyLines >= 1 && placeLines >= 1) || (awardLines >= 1 && placeLines >= 1);
}

function dedupePrizes(prizes: DraftPrize[]): DraftPrize[] {
  const seen = new Set<string>();
  const result: DraftPrize[] = [];
  for (const prize of prizes) {
    const giftSig = [...prize.gift_items].sort().join("|");
    const signature = `${prize.place}|${prize.cash_amount}|${prize.has_trophy ? 1 : 0}|${prize.has_medal ? 1 : 0}|${giftSig}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    result.push(prize);
  }
  return result;
}

function canonicalCategoryKey(name: string): string {
  const normalized = normalizeSectionName(name)
    .replace(/\bprizes?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const under = normalized.match(/\b(?:u[-\s]?|under\s*)0?(\d{1,2})\b/i);
  if (under) {
    const ageKey = under[1].padStart(2, "0");
    if (/\bboys?\b/.test(normalized)) return `boys-under-${ageKey}`;
    if (/\bgirls?\b/.test(normalized)) return `girls-under-${ageKey}`;
    return `under-${ageKey}`;
  }
  if (/\bmain\b/.test(normalized)) return "main-prize";
  return normalized;
}

function dedupeDraftCollections(categories: DraftCategory[], teamGroups: DraftTeamGroup[]): { categories: DraftCategory[]; teamGroups: DraftTeamGroup[] } {
  const categorySeen = new Set<string>();
  const dedupedCategories: DraftCategory[] = [];
  for (const category of categories) {
    const dedupedPrizes = dedupePrizes(category.prizes);
    if (dedupedPrizes.length === 0) continue;
    const categorySig = canonicalCategoryKey(category.name);
    const prizeSig = dedupedPrizes
      .map((prize) => `${prize.place}|${prize.cash_amount}|${prize.has_trophy ? 1 : 0}|${prize.has_medal ? 1 : 0}`)
      .sort()
      .join(",");
    const signature = `${categorySig}|${prizeSig}`;
    if (categorySeen.has(signature)) continue;
    categorySeen.add(signature);
    dedupedCategories.push({ ...category, prizes: dedupedPrizes });
  }

  const teamSeen = new Set<string>();
  const dedupedTeamGroups: DraftTeamGroup[] = [];
  for (const group of teamGroups) {
    const dedupedPrizes = dedupePrizes(group.prizes);
    if (dedupedPrizes.length === 0) continue;
    const signature = `${normalizeSectionName(group.name)}|${dedupedPrizes
      .map((prize) => `${prize.place}|${prize.cash_amount}|${prize.has_trophy ? 1 : 0}|${prize.has_medal ? 1 : 0}`)
      .sort()
      .join(",")}`;
    if (teamSeen.has(signature)) continue;
    teamSeen.add(signature);
    dedupedTeamGroups.push({ ...group, prizes: dedupedPrizes });
  }

  return { categories: dedupedCategories, teamGroups: dedupedTeamGroups };
}

function buildDraft(text: string, brochureUrl: string, selectedEvent: string | null, events: string[], pageCount: number): DraftResult {
  const warnings: string[] = [];
  const categories: DraftCategory[] = [];
  const teamGroups: DraftTeamGroup[] = [];

  // Event filtering: page-aware isolation first, then prize-relevant filtering
  const pages = toParsedPages(text, pageCount);
  let workingPages = pages;
  if (selectedEvent && events.length >= 2) {
    const isolated = isolateEventBlocks(workingPages, selectedEvent, events);
    const pageFallback = isolated.text ? isolated : isolateEventPages(workingPages, selectedEvent, events);
    const finalIsolation = pageFallback;
    if (finalIsolation.text && finalIsolation.isolated.length > 0) {
      workingPages = finalIsolation.isolated;
    } else {
      // Keep previous behavior as true fallback only if page-aware isolation fails.
      const fullText = workingPages.map((page) => page.text).join("\n");
      const sliced = sliceTextForEvent(fullText, selectedEvent, events);
      if (sliced && sliced.length > 20) {
        workingPages = [{ pageIndex: 0, text: sliced }];
      } else {
        warnings.push(`Could not isolate section for event "${selectedEvent}"; using full text`);
      }
    }
  }
  workingPages = selectPrizeRelevantPages(workingPages);
  const workingText = workingPages.map((page) => page.text).join("\n");

  const sections = workingPages.flatMap((page) => detectSections(page.text, page.pageIndex));
  const seenCategoryBlocks = new Set<string>();
  const seenTeamBlocks = new Set<string>();

  let orderIdx = 0;
  const aicfBlocks = parseAicfBlocks(workingText);
  for (const block of aicfBlocks) {
    if (seenCategoryBlocks.has(block.blockKey)) continue;
    seenCategoryBlocks.add(block.blockKey);
    categories.push({
      name: block.name,
      is_main: normalizeSectionName(block.name) === "main prize" && !categories.some((c) => c.is_main),
      order_idx: orderIdx++,
      confidence: block.confidence,
      warnings: [],
      criteria_json: {} as Record<string, never>,
      prizes: block.prizes,
    });
  }

  const khasdarBlocks = parseKhasdarBlocks(workingText);
  warnings.push(...khasdarBlocks.warnings);
  for (const block of khasdarBlocks.categories) {
    if (seenCategoryBlocks.has(block.blockKey)) continue;
    seenCategoryBlocks.add(block.blockKey);
    categories.push({
      name: block.name,
      is_main: normalizeSectionName(block.name) === "main prize" && !categories.some((c) => c.is_main),
      order_idx: orderIdx++,
      confidence: block.confidence,
      warnings: block.confidence === "LOW" ? ["Reconstructed from dense grid; verify against brochure"] : [],
      criteria_json: {} as Record<string, never>,
      prizes: block.prizes,
    });
  }
  for (const group of khasdarBlocks.teamGroups) {
    if (seenTeamBlocks.has(group.blockKey)) continue;
    seenTeamBlocks.add(group.blockKey);
    teamGroups.push({
      name: group.name,
      group_by: "club",
      team_size: 4,
      confidence: "LOW",
      warnings: ["Team group reconstructed from Khasdar block — verify before applying"],
      prizes: group.prizes,
    });
  }

  if (sections.length === 0) {
    // Fallback: try parsing the entire text as one block
    const prizes = parsePrizeLinesFromBlock(workingText);
    if (prizes.length > 0) {
      categories.push({
        name: "Prizes",
        is_main: true,
        order_idx: 0,
        confidence: "LOW",
        warnings: ["No clear section headings found; parsed from full text"],
        criteria_json: {} as Record<string, never>,
        prizes,
      });
    }
  } else {
    let hasMain = categories.some((category) => category.is_main);

    for (const section of sections) {
      if (section.isTeam) {
        const prizes = parsePrizeLinesFromBlock(section.body);
        if (!hasMinimumPrizeSignal(section.body, prizes)) continue;
        if (seenTeamBlocks.has(section.blockKey)) continue;
        seenTeamBlocks.add(section.blockKey);
        const teamSize = parseTeamSize(section.body);
        teamGroups.push({
          name: section.name,
          group_by: "club",
          team_size: teamSize,
          confidence: "LOW",
          warnings: ["Team group auto-detected — verify structure and group_by field"],
          prizes,
        });
        continue;
      }

      const parsedSections = splitSectionIntoSubcategories(section.name, section.body);
      for (const parsedSection of parsedSections) {
        const prizes = parsePrizeLinesFromBlock(parsedSection.body);
        if (!hasMinimumPrizeSignal(parsedSection.body, prizes)) continue;
        const blockIdentity = `${section.blockKey}:${normalizeSectionName(parsedSection.name)}`;
        if (seenCategoryBlocks.has(blockIdentity)) continue;
        seenCategoryBlocks.add(blockIdentity);

        const isMain = section.isMain && !hasMain;
        if (isMain) hasMain = true;

        categories.push({
          name: parsedSection.name,
          is_main: isMain,
          order_idx: orderIdx++,
          confidence: prizes.some((p) => p.confidence === "HIGH") ? "HIGH" : "MEDIUM",
          warnings: [],
          criteria_json: {} as Record<string, never>,
          prizes,
        });
      }
    }
  }

  // Grid reconstruction pass (page-local), focused on sparse table layouts.
  let nextOrderIdx = categories.length;
  for (const page of workingPages) {
    const grid = parseGridBlocksFromPage(page);
    warnings.push(...grid.warnings);

    for (const category of grid.categories) {
      if (seenCategoryBlocks.has(category.blockKey)) continue;
      seenCategoryBlocks.add(category.blockKey);
      categories.push({
        name: category.name,
        is_main: normalizeSectionName(category.name) === "main prize" && !categories.some((c) => c.is_main),
        order_idx: nextOrderIdx++,
        confidence: category.confidence,
        warnings: ["Reconstructed from grid layout"],
        criteria_json: {} as Record<string, never>,
        prizes: category.prizes,
      });
    }

    for (const group of grid.teamGroups) {
      if (seenTeamBlocks.has(group.blockKey)) continue;
      seenTeamBlocks.add(group.blockKey);
      teamGroups.push({
        name: group.name,
        group_by: "club",
        team_size: 4,
        confidence: "LOW",
        warnings: ["Team group reconstructed from grid — verify before applying"],
        prizes: group.prizes,
      });
    }
  }

  if (categories.length === 0 && teamGroups.length === 0) {
    warnings.push("no_prize_structure_detected");
  }

  const deduped = dedupeDraftCollections(categories, teamGroups);

  // Overall confidence
  const allPrizes = [...deduped.categories.flatMap((c) => c.prizes), ...deduped.teamGroups.flatMap((t) => t.prizes)];
  const highCount = allPrizes.filter((p) => p.confidence === "HIGH").length;
  const overall: Confidence = allPrizes.length === 0 ? "LOW"
    : highCount / allPrizes.length > 0.6 ? "HIGH"
    : highCount / allPrizes.length > 0.2 ? "MEDIUM"
    : "LOW";

  return {
    source: "pdf",
    file_path: brochureUrl,
    overall_confidence: overall,
    warnings,
    categories: deduped.categories,
    team_groups: deduped.teamGroups,
  };
}

// ── Main handler ─────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (hasPingQueryParam(req)) {
    return pingResponse(FUNCTION_NAME, BUILD_VERSION);
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "missing_auth" }, 401);
    }

    const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const tournamentId = body.tournament_id;
    const selectedEvent: string | null = body.selected_event ?? null;
    const mode: ParseMode = body.mode === "draft" ? "draft" : "extract";

    if (!tournamentId || typeof tournamentId !== "string") {
      return jsonResponse({ error: "missing_tournament_id" }, 400);
    }

    const { accessDenied, tournament } = await ensureTournamentAccess(supabase, user.id, tournamentId);
    if (accessDenied) return accessDenied;

    const brochureUrl: string | null = tournament?.brochure_url ?? null;

    if (!brochureUrl) {
      console.log(`[${FUNCTION_NAME}] tournament_id=${tournamentId} status=no_brochure`);
      return jsonResponse({ status: "no_brochure" });
    }

    const ext = getExtension(brochureUrl);

    if (IMAGE_EXTENSIONS.has(ext)) {
      console.log(`[${FUNCTION_NAME}] tournament_id=${tournamentId} status=unsupported_image_without_ocr`);
      return jsonResponse({ status: "unsupported_image_without_ocr" });
    }

    if (ext !== ".pdf") {
      console.log(`[${FUNCTION_NAME}] tournament_id=${tournamentId} status=unsupported_file_type ext=${ext}`);
      return jsonResponse({ status: "unsupported_file_type" });
    }

    const { data: fileBlob, error: dlErr } = await supabase
      .storage
      .from("brochures")
      .download(brochureUrl);

    if (dlErr || !fileBlob) {
      console.log(`[${FUNCTION_NAME}] tournament_id=${tournamentId} status=download_failed`);
      return jsonResponse({ error: "download_failed", message: dlErr?.message ?? "Unknown" }, 500);
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const pdfData = await pdfParse(buffer);
    const text: string = pdfData.text ?? "";
    const pageCount: number = pdfData.numpages ?? 0;
    const textLength = text.length;

    console.log(`[${FUNCTION_NAME}] tournament_id=${tournamentId} text_length=${textLength} page_count=${pageCount} mode=${mode}`);

    if (textLength < 100) {
      return jsonResponse({
        status: "scanned_or_image_only",
        text_length: textLength,
        page_count: pageCount,
      });
    }

    const events = detectEvents(text);

    if (events.length >= 2 && selectedEvent === null) {
      console.log(`[${FUNCTION_NAME}] tournament_id=${tournamentId} status=multi_event_detected events=${events.join(",")}`);
      return jsonResponse({
        status: "multi_event_detected",
        events,
      });
    }

    if (
      selectedEvent !== null &&
      events.length >= 2 &&
      !events.some((event) => event.toLowerCase() === selectedEvent.toLowerCase())
    ) {
      return jsonResponse({
        status: "invalid_selected_event",
        events,
      });
    }

    // ── Default extract mode (Phase 0 — unchanged) ──
    if (mode !== "draft") {
      return jsonResponse({
        status: "ok_text",
        page_count: pageCount,
        text_length: textLength,
        events,
        first_500_chars: text.slice(0, 500),
      });
    }

    // ── Draft mode (Phase 1.1) ──
    const draft = buildDraft(text, brochureUrl, selectedEvent, events, pageCount);

    console.log(`[${FUNCTION_NAME}] tournament_id=${tournamentId} status=ok_draft categories=${draft.categories.length} team_groups=${draft.team_groups.length}`);

    return jsonResponse({
      status: "ok_draft",
      page_count: pageCount,
      text_length: textLength,
      events,
      selected_event: selectedEvent,
      draft,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[${FUNCTION_NAME}] error: ${message}`);
    return jsonResponse({ error: "internal_error", message }, 500);
  }
});
