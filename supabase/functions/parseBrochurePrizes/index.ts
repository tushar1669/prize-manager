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

async function ensureTournamentAccess(
  supabase: SupabaseClient,
  userId: string,
  tournamentId: string
): Promise<Response | null> {
  const { data: tournament, error: tErr } = await supabase
    .from("tournaments")
    .select("id, owner_id, brochure_url")
    .eq("id", tournamentId)
    .maybeSingle();

  if (tErr) {
    return jsonResponse({ error: "db_error", message: tErr.message }, 500);
  }
  if (!tournament) {
    return jsonResponse({ error: "tournament_not_found" }, 404);
  }

  const { data: isMaster, error: roleErr } = await supabase
    .rpc("has_role", { _user_id: userId, _role: "master" });

  if (roleErr) {
    return jsonResponse({ error: "role_check_failed", message: roleErr.message }, 500);
  }
  if (tournament.owner_id !== userId && !isMaster) {
    return jsonResponse({ error: "forbidden", message: "Not authorized for tournament" }, 403);
  }
  return null;
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

function parseCurrencyAmount(text: string): number | null {
  const m = text.match(/(?:₹|Rs\.?\s*|INR\s*)([\d,]+)\s*\/?-?/i);
  if (!m) return null;
  return parseInt(m[1].replace(/,/g, ""), 10) || null;
}

function parsePlaceFromLine(line: string): { places: number[]; isRange: boolean } | null {
  const rangeMatch = line.match(PLACE_RANGE_RE);
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

  if (WINNER_RE.test(line)) return { places: [1], isRange: false };
  if (RUNNER_RE.test(line)) return { places: [2], isRange: false };

  return null;
}

function detectAwards(line: string): { has_trophy: boolean; has_medal: boolean; gift_items: string[] } {
  const has_trophy = TROPHY_RE.test(line);
  const has_medal = MEDAL_RE.test(line);
  const gift_items = [...new Set([...line.matchAll(GIFT_RE)].map((m) => m[0].trim().toLowerCase()))];
  return { has_trophy, has_medal, gift_items };
}

function parsePrizeLinesFromBlock(block: string): DraftPrize[] {
  const lines = block.split("\n");
  const prizes: DraftPrize[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.length < 3) continue;

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

function detectSections(text: string): { name: string; body: string; isMain: boolean; isTeam: boolean }[] {
  const lines = text.split("\n");
  const sections: { name: string; startIdx: number; isMain: boolean; isTeam: boolean }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.length > 120) continue;

    // Check if this line looks like a heading (short, no currency, possibly uppercase)
    const hasCurrency = CURRENCY_RE.test(line);
    CURRENCY_RE.lastIndex = 0; // reset regex state

    if (hasCurrency) continue;

    const isMain = MAIN_HEADING_RE.test(line);
    const isTeam = TEAM_HEADING_RE.test(line);

    // A heading candidate: short line without currency that has some alphabetic content
    const hasAlpha = /[a-zA-Z]{3,}/.test(line);
    if (!hasAlpha) continue;

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
  // Find section boundaries for each event
  const markers = events
    .map((ev) => {
      const re = new RegExp(`\\b${ev}\\b`, "gi");
      const matches: number[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) matches.push(m.index);
      return { event: ev, positions: matches };
    })
    .filter((e) => e.positions.length > 0);

  const target = markers.find((m) => m.event.toLowerCase() === selectedEvent.toLowerCase());
  if (!target || target.positions.length === 0) return null;

  // Use the first occurrence of the selected event as start
  const start = target.positions[0];

  // Find the nearest subsequent event marker (different event) as end
  let end = text.length;
  for (const other of markers) {
    if (other.event.toLowerCase() === selectedEvent.toLowerCase()) continue;
    for (const pos of other.positions) {
      if (pos > start && pos < end) end = pos;
    }
  }

  return text.slice(start, end);
}

function buildDraft(text: string, brochureUrl: string, selectedEvent: string | null, events: string[]): DraftResult {
  const warnings: string[] = [];
  const categories: DraftCategory[] = [];
  const teamGroups: DraftTeamGroup[] = [];

  // Event filtering: if selected_event provided, slice the text
  let workingText = text;
  if (selectedEvent && events.length >= 2) {
    const sliced = sliceTextForEvent(text, selectedEvent, events);
    if (sliced && sliced.length > 50) {
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

    for (const section of sections) {
      if (section.isTeam) {
        const prizes = parsePrizeLinesFromBlock(section.body);
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

      const prizes = parsePrizeLinesFromBlock(section.body);
      if (prizes.length === 0) continue;

      const isMain = section.isMain && !hasMain;
      if (isMain) hasMain = true;

      categories.push({
        name: section.name,
        is_main: isMain,
        order_idx: orderIdx++,
        confidence: prizes.some((p) => p.confidence === "HIGH") ? "HIGH" : "MEDIUM",
        warnings: [],
        criteria_json: {} as Record<string, never>,
        prizes,
      });
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

    const accessDenied = await ensureTournamentAccess(supabase, user.id, tournamentId);
    if (accessDenied) return accessDenied;

    const { data: tournament } = await supabase
      .from("tournaments")
      .select("brochure_url")
      .eq("id", tournamentId)
      .single();

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

    if (selectedEvent !== null && events.length >= 2 && !events.includes(selectedEvent)) {
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
    const draft = buildDraft(text, brochureUrl, selectedEvent, events);

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
