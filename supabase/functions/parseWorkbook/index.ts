import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5?target=deno";
import { CORS_HEADERS, hasPingQueryParam, pingResponse } from "../_shared/health.ts";

const BUILD_VERSION = "2025-12-20T20:00:00Z";
const FUNCTION_NAME = "parseWorkbook";

const { ["Access-Control-Allow-Origin"]: _unused, ...BASE_CORS_HEADERS } = CORS_HEADERS;
const corsHeaders = {
  ...BASE_CORS_HEADERS,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-tournament-id, x-file-name, x-sha256",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

function resolveAllowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  if (!origin) {
    return {};
  }
  return { ...corsHeaders, "Access-Control-Allow-Origin": origin };
}

async function ensureTournamentAccess(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  tournamentId: string,
  responseHeaders: Record<string, string>
): Promise<Response | null> {
  if (!tournamentId) {
    return null;
  }

  const { data: tournamentAccess, error: tournamentAccessError } = await supabase
    .from("tournaments")
    .select("id, owner_id")
    .eq("id", tournamentId)
    .maybeSingle();

  if (tournamentAccessError) {
    throw new Error(`Failed to load tournament access: ${tournamentAccessError.message}`);
  }

  const { data: isMaster, error: roleError } = await supabase
    .rpc("has_role", { _user_id: userId, _role: "master" });

  if (roleError) {
    throw new Error(`Failed to check user role: ${roleError.message}`);
  }

  if (!tournamentAccess || (tournamentAccess.owner_id !== userId && !isMaster)) {
    return new Response(JSON.stringify({ error: "FORBIDDEN", message: "Not authorized for tournament" }), {
      status: 403,
      headers: { ...responseHeaders, "Content-Type": "application/json" }
    });
  }

  return null;
}

function normalizeHeader(header: unknown): string {
  return String(header ?? "").trim();
}

/**
 * Make headers unique by appending (2), (3), etc. for duplicates.
 * Empty cells get __EMPTY_COL_X placeholders.
 */
function withUniqueHeaders(row: unknown[]): string[] {
  const seen = new Map<string, number>();
  return row.map((cell, idx) => {
    const normalized = normalizeHeader(cell);
    if (normalized.length === 0) {
      return `__EMPTY_COL_${idx}`;
    }
    
    const count = seen.get(normalized) ?? 0;
    seen.set(normalized, count + 1);
    
    if (count === 0) {
      return normalized;
    }
    // Append (2), (3), etc. for duplicates
    return `${normalized} (${count + 1})`;
  });
}

// Keep original for backwards compat (not used anymore, but safe)
function withHeaderPlaceholders(row: unknown[]): string[] {
  return withUniqueHeaders(row);
}

function normalizeForMatching(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "_");
}

function normalizeCell(cell: unknown): string {
  return String(cell ?? "")
    .trim()
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/gi, "")
    .toLowerCase();
}

function normalizeGender(raw: unknown): "M" | "F" | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const normalized = s.toUpperCase();
  if (["M", "MALE", "BOY"].includes(normalized)) return "M";
  if (["F", "FEMALE", "GIRL"].includes(normalized)) return "F";

  return null;
}

function genderBlankToMF(raw: unknown): "M" | "F" | null {
  if (raw == null || String(raw).trim() === "") return null;
  const s = String(raw).trim().toUpperCase();
  if (s === "F") return "F";
  return null;
}

type Gender = "M" | "F" | "Other" | null;
type GenderSource = "gender_column" | "fs_column" | "headerless_after_name" | "type_label" | "group_label";

interface GenderInference {
  gender: Gender;
  female_signal_source: "FMG" | "F_PREFIX" | "FS_SIGNAL" | "TITLE" | "GIRL_TOKEN" | null;
  gender_source: GenderSource | null;
  sources: GenderSource[];
  warnings: string[];
}

interface GenderColumnConfig {
  genderColumn: string | null;
  fsColumn: string | null;
  headerlessGenderColumn: string | null;
  preferredColumn: string | null;
  preferredSource: GenderSource | null;
}

const HEADER_ALIASES = {
  gender: ["gender", "sex", "g", "m/f", "boy/girl", "b/g", "fs"]
};

const HEADERLESS_KEY_PATTERN = /^__empty/i;

// Strict single-letter gender tokens for headerless column detection
// Only F, M, B, G - prevents false positives from short name columns
const STRICT_SINGLE_LETTER_GENDER = new Set(["f", "m", "b", "g"]);

// Rating column headers to detect the Name-Rtg gap region
const RATING_HEADERS = new Set(["rtg", "irtg", "nrtg", "rating", "elo", "std"]);

const NAME_ALIASES = [
  "name",
  "player_name",
  "full_name",
  "full name",
  "fullname",
  "name.1",
  "name_1",
  "player",
  "playername",
  "participant"
];
const NORMALIZED_NAME_HEADERS = new Set(NAME_ALIASES.map((alias) => normalizeForMatching(alias)));

function isHeaderlessKey(key: string | undefined): key is string {
  if (key === undefined) return false;
  if (key.trim().length === 0) return true;
  return HEADERLESS_KEY_PATTERN.test(key);
}

/**
 * Strict single-letter gender detection for headerless columns
 * Only accepts F, M, B, G (case-insensitive)
 * Prevents false positives from short names like "K. Arun"
 */
function looksLikeStrictGenderValue(value: unknown): boolean {
  if (value == null) return false;
  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed) return false;
  
  // Must be exactly one letter
  if (trimmed.length !== 1) return false;
  
  return STRICT_SINGLE_LETTER_GENDER.has(trimmed);
}

// Female markers in Type/Group labels
const FEMALE_MARKER_FMG = /FMG/i;
const FEMALE_MARKER_F_PREFIX = /^F\d{1,2}$/;
const FEMALE_LABEL_TOKENS = new Set(["GIRL", "GIRLS"]);

// Explicit gender column values
const EXPLICIT_FEMALE_TOKENS = new Set(["F", "FEMALE", "GIRL", "GIRLS"]);
const EXPLICIT_MALE_TOKENS = new Set(["M", "MALE", "BOY", "BOYS"]);

// FS/Headerless female signals (female-only columns)
const FS_FEMALE_EXACT = new Set(["F", "G", "W", "GIRL", "GIRLS"]);
const FS_FEMALE_TITLE_PREFIXES = ["WFM", "WIM", "WGM", "WCM"];

// Non-gender chess titles to avoid false positives
const NON_GENDER_TITLES = new Set(["FM", "IM", "GM", "CM", "AGM", "AFM", "NM", "AM"]);

const tokenizeLabel = (label?: string | null): string[] =>
  String(label ?? "")
    .trim()
    .split(/[\s,;|/]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

const hasFemaleMarker = (label?: string | null): boolean =>
  tokenizeLabel(label).some((token) => {
    const upper = token.toUpperCase();
    if (FEMALE_MARKER_FMG.test(upper)) return true;
    if (FEMALE_MARKER_F_PREFIX.test(upper)) return true;
    if (FEMALE_LABEL_TOKENS.has(upper)) return true;
    return false;
  });

function normalizeExplicitGender(value: unknown): Gender {
  if (value == null) return null;
  const upper = String(value).trim().toUpperCase();
  if (!upper) return null;

  if (EXPLICIT_FEMALE_TOKENS.has(upper)) return "F";
  if (EXPLICIT_MALE_TOKENS.has(upper)) return "M";
  return null;
}

/**
 * Check if FS/headerless column value indicates female
 * Swiss-Manager FS column: F means female, blank means unknown (not male)
 * Also handles: G, W, GIRL, GIRLS, WFM, WIM, WGM, WCM prefixes
 * NEVER treats FM, IM, GM, CM, AGM, AFM as gender
 */
function isFsOrHeaderlessFemale(value: unknown): { isFemale: boolean; reason: "FS_SIGNAL" | "TITLE" | null } {
  if (value == null) return { isFemale: false, reason: null };
  const trimmed = String(value).trim();
  if (!trimmed) return { isFemale: false, reason: null };
  
  const upper = trimmed.toUpperCase();
  
  // Check exact matches first (F, G, W, GIRL, GIRLS)
  if (FS_FEMALE_EXACT.has(upper)) {
    return { isFemale: true, reason: "FS_SIGNAL" };
  }
  
  // Check title prefixes (WFM, WIM, WGM, WCM)
  for (const prefix of FS_FEMALE_TITLE_PREFIXES) {
    if (upper.startsWith(prefix)) {
      return { isFemale: true, reason: "TITLE" };
    }
  }
  
  // Explicitly reject non-gender chess titles
  for (const title of NON_GENDER_TITLES) {
    if (upper === title || upper.startsWith(title + " ")) {
      return { isFemale: false, reason: null };
    }
  }
  
  return { isFemale: false, reason: null };
}

/**
 * Detect female signal from Type or Group label
 */
function detectFemaleSignalFromLabel(label?: string | null): { 
  isFemale: boolean; 
  reason: "FMG" | "F_PREFIX" | "GIRL_TOKEN" | null 
} {
  const tokens = tokenizeLabel(label);
  for (const token of tokens) {
    const upper = token.toUpperCase();
    
    if (FEMALE_MARKER_FMG.test(upper)) {
      return { isFemale: true, reason: "FMG" };
    }
    if (FEMALE_MARKER_F_PREFIX.test(upper)) {
      return { isFemale: true, reason: "F_PREFIX" };
    }
    if (FEMALE_LABEL_TOKENS.has(upper)) {
      return { isFemale: true, reason: "GIRL_TOKEN" };
    }
  }

  return { isFemale: false, reason: null };
}

/**
 * Find a headerless gender column in Swiss-Manager files.
 * 
 * Swiss-Manager ranking lists often have this structure:
 *   Rank | SNo | [Title] | Name | Name | [HEADERLESS F/blank] | Rtg | ...
 * 
 * The key insight is that the gender column is headerless (empty header)
 * and located BETWEEN the last Name column and the first Rating column.
 * 
 * Detection algorithm:
 * 1. Find the LAST Name column index (there may be multiple "Name" columns)
 * 2. Find the FIRST Rating column index (Rtg, IRtg, NRtg, Rating, etc.)
 * 3. Scan all columns between lastNameIndex and firstRatingIndex
 * 4. For each headerless column in that region, score by counting F/M/B/G values
 * 5. Pick the column with the highest score (any matches > 0)
 */
function findHeaderlessGenderColumn(
  headers: string[],
  sampleRows: Array<Record<string, unknown>> = []
): string | null {
  if (!Array.isArray(headers) || headers.length === 0) {
    return null;
  }

  if (!Array.isArray(sampleRows) || sampleRows.length === 0) {
    return null;
  }

  const normalizedHeaders = headers.map((header) => normalizeForMatching(header));
  
  // Step 1: Find the LAST Name column index (Swiss-Manager often has 2 Name columns)
  let lastNameIndex = -1;
  for (let i = 0; i < normalizedHeaders.length; i += 1) {
    if (NORMALIZED_NAME_HEADERS.has(normalizedHeaders[i])) {
      lastNameIndex = i;  // Don't break - keep going to find the LAST one
    }
  }

  if (lastNameIndex === -1) {
    return null;
  }

  // Step 2: Find the FIRST Rating column index
  let firstRatingIndex = -1;
  for (let i = 0; i < normalizedHeaders.length; i += 1) {
    if (RATING_HEADERS.has(normalizedHeaders[i])) {
      firstRatingIndex = i;
      break;  // Stop at FIRST rating column
    }
  }

  // Step 3: Determine the search region for headerless gender columns
  const searchEndIndex = firstRatingIndex > lastNameIndex 
    ? firstRatingIndex 
    : headers.length;

  // Step 4: Collect candidate headerless columns in the Name-Rtg gap
  const candidateStats = new Map<string, { total: number; matches: number }>();

  const registerCandidate = (key: string | undefined) => {
    if (!isHeaderlessKey(key)) return;
    if (!candidateStats.has(key)) {
      candidateStats.set(key, { total: 0, matches: 0 });
    }
  };

  // Register all headerless columns between lastNameIndex and firstRatingIndex
  for (let i = lastNameIndex + 1; i < searchEndIndex; i += 1) {
    registerCandidate(headers[i]);
  }

  // Also check row keys for any headerless columns in that region
  const sampleLimit = Math.min(sampleRows.length, 500);
  for (let i = 0; i < sampleLimit; i += 1) {
    const row = sampleRows[i];
    if (!row || typeof row !== "object") continue;

    const keys = Object.keys(row);
    if (keys.length === 0) continue;

    // Find the last name key index in this row's keys
    let rowLastNameIndex = -1;
    for (let j = 0; j < keys.length; j += 1) {
      if (NORMALIZED_NAME_HEADERS.has(normalizeForMatching(keys[j]))) {
        rowLastNameIndex = j;
      }
    }

    // Find the first rating key index in this row's keys
    let rowFirstRatingIndex = -1;
    for (let j = 0; j < keys.length; j += 1) {
      if (RATING_HEADERS.has(normalizeForMatching(keys[j]))) {
        rowFirstRatingIndex = j;
        break;
      }
    }

    // Register headerless columns in the gap
    const rowSearchEnd = rowFirstRatingIndex > rowLastNameIndex 
      ? rowFirstRatingIndex 
      : keys.length;
    
    for (let j = rowLastNameIndex + 1; j < rowSearchEnd; j += 1) {
      registerCandidate(keys[j]);
    }
  }

  if (candidateStats.size === 0) {
    return null;
  }

  // Step 5: Score each candidate by counting gender-looking values
  for (let i = 0; i < sampleLimit; i += 1) {
    const row = sampleRows[i];
    if (!row || typeof row !== "object") continue;

    const typedRow = row as Record<string, unknown>;
    for (const [key, stats] of candidateStats.entries()) {
      const value = typedRow[key];
      if (value === undefined || value === null) continue;
      const str = String(value).trim();
      if (!str) continue;

      stats.total += 1;
      if (looksLikeStrictGenderValue(str)) {
        stats.matches += 1;
      }
    }
  }

  // Step 6: Pick the best candidate (highest match count, matches > 0)
  let bestKey: string | null = null;
  let bestMatches = 0;
  for (const [key, stats] of candidateStats.entries()) {
    if (stats.matches === 0) continue;
    if (stats.matches > bestMatches) {
      bestKey = key;
      bestMatches = stats.matches;
    }
  }

  return bestKey;
}

function collectHeaders(rows: Array<Record<string, unknown>>): string[] {
  const headers: string[] = [];
  const seen = new Set<string>();

  rows.forEach((row) => {
    if (!row || typeof row !== "object") return;
    Object.keys(row).forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    });
  });

  return headers;
}

function analyzeGenderColumns(rows: Array<Record<string, unknown>>): GenderColumnConfig {
  const headers = collectHeaders(rows);
  const normalized = headers.map(normalizeForMatching);
  const genderAliases = (HEADER_ALIASES.gender || []).map(normalizeForMatching);
  const fsToken = normalizeForMatching("fs");

  let genderColumn: string | null = null;
  let fsColumn: string | null = null;

  normalized.forEach((key, idx) => {
    if (genderAliases.includes(key) && key !== fsToken && !genderColumn) {
      genderColumn = headers[idx];
    }
    if (key === fsToken && !fsColumn) {
      fsColumn = headers[idx];
    }
  });

  const headerlessGenderColumn =
    findHeaderlessGenderColumn(headers, rows as Array<Record<string, unknown>>) || null;

  const preferredColumn = genderColumn || fsColumn || headerlessGenderColumn || null;
  let preferredSource: GenderSource | null = null;
  if (preferredColumn) {
    if (preferredColumn === genderColumn) {
      preferredSource = "gender_column";
    } else if (preferredColumn === fsColumn) {
      preferredSource = "fs_column";
    } else if (preferredColumn === headerlessGenderColumn) {
      preferredSource = "headerless_after_name";
    }
  }

  return {
    genderColumn,
    fsColumn,
    headerlessGenderColumn,
    preferredColumn,
    preferredSource
  };
}

function inferGenderForRow(
  row: Record<string, unknown>,
  config?: GenderColumnConfig | null,
  typeLabel?: string | null,
  groupLabel?: string | null
): GenderInference {
  const result: GenderInference = {
    gender: null,
    female_signal_source: null,
    gender_source: null,
    sources: [],
    warnings: []
  };

  let explicitMale = false;

  // 1. Check explicit gender column
  const genderColumn = config?.genderColumn ?? (config?.preferredSource === "gender_column" ? config?.preferredColumn : null);
  const explicitGenderValue = genderColumn ? row[genderColumn] : "gender" in row ? (row as Record<string, unknown>).gender : undefined;
  const explicitGender = normalizeExplicitGender(explicitGenderValue);

  if (explicitGender === "F") {
    result.gender = "F";
    result.sources.push("gender_column");
    result.gender_source = "gender_column";
  } else if (explicitGender === "M") {
    explicitMale = true;
    result.gender = "M";
    result.sources.push("gender_column");
    result.gender_source = "gender_column";
  }

  // 2. Check FS column (female-only signal)
  const fsValue = config?.fsColumn ? row[config.fsColumn] : undefined;
  const { isFemale: fsFemale, reason: fsReason } = isFsOrHeaderlessFemale(fsValue);
  if (fsFemale) {
    if (explicitMale) {
      result.warnings.push("female signal overrides explicit male gender");
    }
    result.gender = "F";
    result.sources.push("fs_column");
    result.gender_source = "fs_column";
    result.female_signal_source = result.female_signal_source ?? fsReason;
  }

  // 3. Check headerless gender column (female-only signal)
  const headerlessValue = config?.headerlessGenderColumn ? row[config.headerlessGenderColumn] : undefined;
  const { isFemale: headerlessFemale, reason: headerlessReason } = isFsOrHeaderlessFemale(headerlessValue);
  if (headerlessFemale) {
    if (result.gender === "M" && !result.sources.includes("fs_column")) {
      result.warnings.push("female signal overrides explicit male gender");
    }
    result.gender = "F";
    result.sources.push("headerless_after_name");
    result.gender_source = "headerless_after_name";
    result.female_signal_source = result.female_signal_source ?? headerlessReason;
  }

  // 4. Check Type label for female markers
  const { isFemale: femaleFromType, reason: typeReason } = detectFemaleSignalFromLabel(typeLabel);
  if (femaleFromType) {
    if (result.gender === "M" && !result.sources.includes("fs_column") && !result.sources.includes("headerless_after_name")) {
      result.warnings.push("female signal overrides explicit male gender");
    }
    result.gender = "F";
    result.sources.push("type_label");
    if (!result.gender_source || result.gender_source === "gender_column") {
      result.gender_source = "type_label";
    }
    result.female_signal_source = result.female_signal_source ?? typeReason;
  }

  // 5. Check Group label for female markers
  const { isFemale: femaleFromGroup, reason: groupReason } = detectFemaleSignalFromLabel(groupLabel);
  if (femaleFromGroup) {
    if (result.gender === "M" && !result.sources.includes("fs_column") && !result.sources.includes("headerless_after_name") && !result.sources.includes("type_label")) {
      result.warnings.push("female signal overrides explicit male gender");
    }
    result.gender = "F";
    result.sources.push("group_label");
    if (!result.gender_source || result.gender_source === "gender_column") {
      result.gender_source = "group_label";
    }
    result.female_signal_source = result.female_signal_source ?? groupReason;
  }

  // Dedupe sources
  result.sources = Array.from(new Set(result.sources));

  return result;
}

function scoreRow(row: unknown[]): number {
  const normalized = row.map(normalizeCell);
  let score = 0;

  const coreFields = ["rank", "name", "sno", "rtg", "irtg", "rating", "birth", "dob"];
  const coreHits = coreFields.filter((field) => normalized.some((cell) => cell.includes(field)));
  score += coreHits.length * 10;

  const secondaryFields = ["fide", "gender", "fed", "club", "state", "city"];
  const secondaryHits = secondaryFields.filter((field) => normalized.some((cell) => cell.includes(field)));
  score += secondaryHits.length * 3;

  if (normalized.some((cell) => /^\d{4}$/.test(cell))) {
    score -= 20;
  }

  const hasLargeNumbers = row.some((cell) => {
    const num = parseFloat(String(cell ?? ""));
    return !Number.isNaN(num) && num > 100;
  });
  if (hasLargeNumbers) {
    score -= 10;
  }

  const nonEmptyCells = row.filter((cell) => String(cell ?? "").trim() !== "").length;
  if (nonEmptyCells < 3) {
    score -= 15;
  }

  if (normalized.some((cell) => cell === "rank")) score += 5;
  if (normalized.some((cell) => cell === "sno" || cell === "startno")) score += 5;
  if (normalized.some((cell) => cell === "rtg")) score += 5;

  return score;
}

function detectHeaders(workbook: XLSX.WorkBook): { sheetName: string; headerRowIndex: number; headers: string[] } {
  const candidates: Array<{ sheetName: string; rowIndex: number; score: number; headers: string[] }> = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const asMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as unknown[][];
    if (!Array.isArray(asMatrix) || asMatrix.length === 0) continue;

    const scanLimit = Math.min(25, asMatrix.length);
    for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
      const row = asMatrix[rowIndex];
      if (!row || row.length < 3) continue;

      const score = scoreRow(row);
      if (score > 15) {
        const headers = withHeaderPlaceholders(row);
        candidates.push({ sheetName, rowIndex, score, headers });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) {
    throw new Error("No valid header row found. Please ensure the file contains Rank and Name columns.");
  }
  return {
    sheetName: best.sheetName,
    headerRowIndex: best.rowIndex,
    headers: best.headers
  };
}

function inferSource(
  headers: string[],
  sampleRows: Array<Record<string, unknown>>
): "swiss-manager" | "organizer-template" | "unknown" {
  const normalized = headers.map((header) => normalizeForMatching(header));
  const swiss = ["rank", "sno", "rtg", "fideno"];
  const template = ["rank", "name", "rating", "dob"];

  const headerlessGender = findHeaderlessGenderColumn(headers, sampleRows);

  if (swiss.every((key) => normalized.includes(key)) && headerlessGender) {
    return "swiss-manager";
  }
  if (template.every((key) => normalized.includes(key))) return "organizer-template";
  return "unknown";
}

async function sha256Hex(buffer: ArrayBuffer | SharedArrayBuffer): Promise<string> {
  // Convert SharedArrayBuffer to ArrayBuffer for crypto.subtle
  const ab = (buffer instanceof ArrayBuffer 
    ? buffer 
    : new Uint8Array(buffer).buffer) as ArrayBuffer;
  const hashBuffer = await crypto.subtle.digest("SHA-256", ab);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function parseBody(req: Request): Promise<{ bytes: Uint8Array; fileName: string; contentType: string }> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    for (const value of form.values()) {
      if (value instanceof File) {
        const bytes = new Uint8Array(await value.arrayBuffer());
        const name = value.name || req.headers.get("x-file-name") || "upload.xlsx";
        const type = value.type || "application/octet-stream";
        return { bytes, fileName: name, contentType: type };
      }
    }
    throw new Error("No file found in multipart payload");
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  const fileName = req.headers.get("x-file-name") || "upload.xlsx";
  if (bytes.byteLength === 0) {
    throw new Error("Empty payload received");
  }
  const type = contentType || "application/octet-stream";
  return { bytes, fileName, contentType: type };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  
  // CORS preflight and health-check handlers MUST run BEFORE origin allowlist
  // to allow Master Dashboard health checks from any Lovable preview origin.
  // These are safe because they don't access any data.
  
  // Health check: ?ping=1 (parseWorkbook uses binary body, so only query param ping)
  // Responds with permissive CORS to allow browser-based health checks
  if (hasPingQueryParam(req)) {
    console.log(`[${FUNCTION_NAME}] ping via query param`);
    return pingResponse(FUNCTION_NAME, BUILD_VERSION, CORS_HEADERS);
  }
  
  // OPTIONS preflight with permissive CORS for health checks
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // For actual parsing requests, enforce origin allowlist
  const allowedOrigin = resolveAllowedOrigin(origin);
  if (origin && !allowedOrigin) {
    return new Response(JSON.stringify({ error: "FORBIDDEN", message: "Origin not allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }

  const corsHeadersForRequest = buildCorsHeaders(allowedOrigin);

  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeadersForRequest, "Content-Type": "application/json" }
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeadersForRequest, "Content-Type": "application/json" }
    });
  }

  const tournamentId = req.headers.get("x-tournament-id") ?? "";
  const providedHash = req.headers.get("x-sha256") ?? "";
  // Debug tournament IDs for gender detection logging
  const genderDebugTournamentIds = new Set([
    "74e1bd2b-0b3b-4cd6-abfc-30a6a7c2bf15", // Road to GCL
    "0d54de9f-242a-41bd-a2ad-a70f712c3fd7"  // Jaipur
  ]);

  try {
    const accessResponse = await ensureTournamentAccess(
      supabase,
      authData.user.id,
      tournamentId,
      corsHeadersForRequest
    );
    if (accessResponse) {
      return accessResponse;
    }

    const start = performance.now();
    const { bytes, fileName, contentType } = await parseBody(req);
    const bufferSlice = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    console.log(`[import.srv] start bytes=${bytes.byteLength}`);

    const fileHash = await sha256Hex(bufferSlice);
    if (providedHash && providedHash !== fileHash) {
      console.warn(`[import.srv] hash mismatch header=${providedHash} computed=${fileHash}`);
    }

    const workbook = XLSX.read(bufferSlice, { type: "array" });
    if (!workbook.SheetNames?.length) {
      throw new Error("No sheets found in workbook");
    }

    const { sheetName, headerRowIndex, headers } = detectHeaders(workbook);
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new Error("Detected sheet missing");
    }

    const trimmedHeaders = headers.map((header, idx) => {
      const normalized = normalizeHeader(header);
      return normalized.length > 0 ? normalized : `__EMPTY_COL_${idx}`;
    });
    const dataRows = XLSX.utils.sheet_to_json(sheet, {
      header: trimmedHeaders,
      range: headerRowIndex + 1,
      raw: false,
      defval: ""
    }) as Record<string, unknown>[];

    const genderConfig = analyzeGenderColumns(dataRows as Record<string, unknown>[]);

    const shouldGenderDebug = genderDebugTournamentIds.has(tournamentId);
    const genderDebugCounts: Record<string, number> | null = shouldGenderDebug
      ? {
          FMG: 0,
          F_PREFIX: 0,
          FS: 0,
          Headerless: 0,
          ExplicitGender: 0,
          None: 0
        }
      : null;

    // Log gender config for debug tournaments
    if (shouldGenderDebug) {
      console.log(`[import.gender-config] ${JSON.stringify(genderConfig)}`);
    }

    const rowsWithGender = dataRows.map((row) => {
      const typedRow = row as Record<string, unknown>;
      const typeRaw = (typedRow.type_label ?? typedRow.type ?? typedRow.Type ?? typedRow.TYPE) as
        | string
        | undefined;
      const groupRaw = (typedRow.group_label ?? typedRow.group ?? typedRow.Group ?? typedRow.GROUP) as
        | string
        | undefined;

      const genderInference = inferGenderForRow(typedRow, genderConfig, typeRaw ?? null, groupRaw ?? null);

      if (genderDebugCounts) {
        const femaleSignalSource = (() => {
          if (genderInference.female_signal_source === "FMG") return "FMG";
          if (genderInference.female_signal_source === "F_PREFIX") return "F_PREFIX";
          if (genderInference.sources.includes("fs_column")) return "FS";
          if (genderInference.sources.includes("headerless_after_name")) return "Headerless";
          if (genderInference.sources.includes("gender_column")) return "ExplicitGender";
          return "None";
        })();
        genderDebugCounts[femaleSignalSource] = (genderDebugCounts[femaleSignalSource] ?? 0) + 1;
      }

      return {
        ...row,
        _gender: genderInference.gender,
        _gender_source: genderInference.gender_source,
        _genderSources: genderInference.sources,
        _genderWarnings: genderInference.warnings
      };
    });

    const source = inferSource(trimmedHeaders, dataRows as Record<string, unknown>[]);
    const durationMs = Math.round(performance.now() - start);
    const rowCount = dataRows.length;

    if (genderDebugCounts) {
      console.log(`[import.gender-debug] rows=${rowCount} signals=${JSON.stringify(genderDebugCounts)}`);
    }

    console.log(`[import.srv] ok rows=${rowCount} sheet=${sheetName} headerRow=${headerRowIndex + 1} duration_ms=${durationMs}`);

    if (tournamentId) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const path = `imports/${authData.user.id}/${tournamentId}/${today}/${fileHash}_${fileName}`;
        await supabase.storage.from("imports").upload(path, bufferSlice, {
          contentType,
          upsert: false
        });
      } catch (storageError) {
        const err = storageError as Error;
        if (!err.message?.includes("already exists")) {
          console.warn(`[import.srv] storage error=${err.message}`);
        }
      }
    }

    const responseBody = {
      sheetName,
      headerRow: headerRowIndex + 1,
      headers: trimmedHeaders,
      rows: rowsWithGender,
      genderConfig,
      fileHash,
      rowCount,
      source,
      durationMs
    };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { ...corsHeadersForRequest, "Content-Type": "application/json" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "parse failed";
    console.error(`[import.srv] error message=${message}`);
    return new Response(JSON.stringify({ error: message }), {
      status: 503,
      headers: { ...corsHeadersForRequest, "Content-Type": "application/json" }
    });
  }
});
