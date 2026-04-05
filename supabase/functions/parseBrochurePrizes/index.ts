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

// ── Draft heuristic functions ────────────────────────────────────────────

const CURRENCY_RE = /(?:₹|Rs\.?\s*|INR\s*)([\d,]+)\s*\/?-?/gi;
const PLACE_SINGLE_RE = /(\d+)\s*(?:st|nd|rd|th)/i;
const PLACE_RANGE_RE = /(\d+)\s*(?:st|nd|rd|th)?\s*[-–—]+\s*(\d+)\s*(?:st|nd|rd|th)/i;
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
const CATEGORY_LABEL_RE = /^(?:rated\s+\d{3,4}\s*[-–]\s*\d{3,4}|unrated|best\s+[a-z0-9+ -]+|under\s*\d{1,2}\s*(?:boys|girls)|u[-\s]?\d{1,2})\b/i;
const TROPHY_TOKEN_RE = /(?:\bT\b|\+?\s*TROPHY\b|🏆)/i;
const MEDAL_TOKEN_RE = /(?:\bM\b|\+?\s*MEDAL\b|🏅)/i;
const NOTE_ONLY_RE = /\b(?:for\s+all|participants?)\b/i;

function parseCurrencyAmount(text: string): number | null {
  const m = text.match(/(?:₹|Rs\.?\s*|INR\s*)([\d,]+)\s*\/?-?/i);
  if (!m) return null;
  return parseInt(m[1].replace(/,/g, ""), 10) || null;
}

function parsePlaceFromLine(line: string): { places: number[]; isRange: boolean } | null {
  const rangeMatch = line.match(/(?:^|[\s:])(\d+)\s*(?:st|nd|rd|th)?\s*(?:to|[-–—]+)\s*(\d+)\s*(?:st|nd|rd|th)?\b/i) ?? line.match(PLACE_RANGE_RE);
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

function parsePrizeLinesFromBlock(block: string): DraftPrize[] {
  const lines = block.split("\n");
  const prizes: DraftPrize[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.length < 3) continue;

    if (NOTE_ONLY_RE.test(line) && !parseCurrencyAmount(line) && !parsePlaceFromLine(line)) {
      continue;
    }

    const placeResult = parsePlaceFromLine(line);
    const amount = parseCurrencyAmount(line);
    const awards = detectAwards(line);

    if (!placeResult && amount === null && !awards.has_trophy && !awards.has_medal && awards.gift_items.length === 0) {
      continue;
    }

    if (placeResult) {
      const cashAmount = amount ?? (awards.has_trophy || awards.has_medal || awards.gift_items.length > 0 ? 0 : 0);
      const confidence: Confidence = (amount !== null && !placeResult.isRange) ? "HIGH"
        : (amount !== null && placeResult.isRange) ? "MEDIUM"
        : "LOW";

      for (const place of placeResult.places) {
        prizes.push({
          place,
          cash_amount: cashAmount,
          has_trophy: awards.has_trophy,
          has_medal: awards.has_medal,
          gift_items: awards.gift_items,
          confidence,
          source_text: line.slice(0, 200),
        });
      }
    } else if (amount !== null) {
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

function scorePrizePage(pageText: string): number {
  const lines = pageText.split("\n").map((line) => normalizeTextLine(line)).filter(Boolean);
  const headingHits = lines.filter((line) => PRIZE_HEADING_RE.test(line)).length;
  const currencyHits = lines.filter((line) => /(?:₹|Rs\.?\s*|INR\s*)\d/i.test(line)).length;
  const placeHits = lines.filter((line) => parsePlaceFromLine(line) !== null).length;
  const categoryHits = lines.filter((line) => CATEGORY_LABEL_RE.test(line)).length;
  return headingHits * 6 + currencyHits * 2 + placeHits * 2 + categoryHits;
}

function selectPrizeRelevantText(text: string, pageCount: number): string {
  const pages = splitPages(text, pageCount);
  if (pages.length <= 1) return text;

  const scored = pages.map((pageText, index) => ({ index, pageText, score: scorePrizePage(pageText) }));
  const strongPages = scored.filter((page) => page.score >= 10).sort((a, b) => a.index - b.index);
  if (strongPages.length > 0) return strongPages.map((page) => page.pageText).join("\n");

  const fallback = scored.filter((page) => page.score >= 6).sort((a, b) => a.index - b.index);
  if (fallback.length > 0) return fallback.map((page) => page.pageText).join("\n");
  return text;
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

function detectSections(text: string): { name: string; body: string; isMain: boolean; isTeam: boolean }[] {
  const lines = text.split("\n");
  const sections: { name: string; startIdx: number; isMain: boolean; isTeam: boolean }[] = [];
  const seenSectionNames = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = normalizeTextLine(lines[i]);
    if (!line || line.length > 80) continue;

    // Check if this line looks like a heading (short, no currency, possibly uppercase)
    const hasCurrency = CURRENCY_RE.test(line);
    CURRENCY_RE.lastIndex = 0; // reset regex state

    if (hasCurrency) continue;

    const isMain = MAIN_HEADING_RE.test(line);
    const isTeam = TEAM_HEADING_RE.test(line);

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
      const normalizedName = normalizeSectionName(line);
      if (seenSectionNames.has(normalizedName)) continue;
      seenSectionNames.add(normalizedName);
      sections.push({ name: line, startIdx: i, isMain, isTeam });
    }
  }

  // Build body text for each section (from heading to next heading or EOF, capped at 2000 chars)
  const result: { name: string; body: string; isMain: boolean; isTeam: boolean }[] = [];
  for (let s = 0; s < sections.length; s++) {
    const startLine = sections[s].startIdx + 1;
    const endLine = s + 1 < sections.length ? sections[s + 1].startIdx : lines.length;
    const body = lines.slice(startLine, endLine).join("\n").slice(0, 2000);
    result.push({
      name: sections[s].name,
      body,
      isMain: sections[s].isMain,
      isTeam: sections[s].isTeam,
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

function hasMinimumPrizeSignal(sectionBody: string, prizes: DraftPrize[]): boolean {
  if (prizes.length === 0) return false;
  const lines = sectionBody.split("\n").map((line) => normalizeTextLine(line)).filter(Boolean);
  const currencyLines = lines.filter((line) => /(?:₹|Rs\.?\s*|INR\s*)\d/i.test(line)).length;
  const awardLines = lines.filter((line) => detectAwards(line).has_trophy || detectAwards(line).has_medal).length;
  const placeLines = lines.filter((line) => parsePlaceFromLine(line) !== null).length;
  return (currencyLines >= 1 && placeLines >= 1) || (awardLines >= 1 && placeLines >= 1);
}

function buildDraft(text: string, brochureUrl: string, selectedEvent: string | null, events: string[], pageCount: number): DraftResult {
  const warnings: string[] = [];
  const categories: DraftCategory[] = [];
  const teamGroups: DraftTeamGroup[] = [];

  // Event filtering: if selected_event provided, slice the text
  let workingText = selectPrizeRelevantText(text, pageCount);
  if (selectedEvent && events.length >= 2) {
    const sliced = sliceTextForEvent(workingText, selectedEvent, events);
    if (sliced && sliced.length > 20) {
      workingText = sliced;
    } else {
      warnings.push(`Could not isolate section for event "${selectedEvent}"; using full text`);
    }
  }

  const sections = detectSections(workingText);

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
    let orderIdx = 0;
    let hasMain = false;
    const seenTeamNames = new Set<string>();

    for (const section of sections) {
      if (section.isTeam) {
        const prizes = parsePrizeLinesFromBlock(section.body);
        if (!hasMinimumPrizeSignal(section.body, prizes)) continue;
        const teamNameKey = normalizeSectionName(section.name);
        if (seenTeamNames.has(teamNameKey)) continue;
        seenTeamNames.add(teamNameKey);
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

  if (categories.length === 0 && teamGroups.length === 0) {
    warnings.push("no_prize_structure_detected");
  }

  // Overall confidence
  const allPrizes = [...categories.flatMap((c) => c.prizes), ...teamGroups.flatMap((t) => t.prizes)];
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
    categories,
    team_groups: teamGroups,
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
