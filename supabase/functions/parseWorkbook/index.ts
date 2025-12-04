import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tournament-id, x-file-name, x-sha256",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function normalizeHeader(header: unknown): string {
  return String(header ?? "").trim();
}

function withHeaderPlaceholders(row: unknown[]): string[] {
  return row.map((cell, idx) => {
    const normalized = normalizeHeader(cell);
    return normalized.length > 0 ? normalized : `__EMPTY_COL_${idx}`;
  });
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
const GENDER_VALUE_TOKENS = new Set([
  "m",
  "f",
  "male",
  "female",
  "boy",
  "girl",
  "boys",
  "girls",
  "men",
  "women",
  "other",
  "w",
  "g",
  "b",
  "o"
]);

const NAME_ALIASES = ["name", "player_name", "full_name", "player", "playername", "participant"];
const NORMALIZED_NAME_HEADERS = new Set(NAME_ALIASES.map((alias) => normalizeForMatching(alias)));

function isHeaderlessKey(key: string | undefined): key is string {
  if (key === undefined) return false;
  if (key.trim().length === 0) return true;
  return HEADERLESS_KEY_PATTERN.test(key);
}

function looksLikeGenderValue(value: unknown): boolean {
  if (value == null) return false;
  const normalized = String(value)
    .trim()
    .toLowerCase();
  if (!normalized) return false;

  const alphaOnly = normalized.replace(/[^a-z]/g, "");
  if (GENDER_VALUE_TOKENS.has(alphaOnly)) return true;
  if (alphaOnly === "mf" || alphaOnly === "fm") return true;

  return false;
}

const FEMALE_MARKER_REGEX = /^F(?:MG|\d+|[-].+)?$/;
const tokenizeLabel = (label?: string | null): string[] =>
  String(label ?? "")
    .trim()
    .split(/[\s,;|/]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

const hasFemaleMarker = (label?: string | null): boolean =>
  tokenizeLabel(label).some((token) => {
    const upper = token.toUpperCase();
    if (upper.includes("FMG")) return true;
    return FEMALE_MARKER_REGEX.test(upper);
  });

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
  let nameIndex = -1;
  for (let i = 0; i < normalizedHeaders.length; i += 1) {
    if (NORMALIZED_NAME_HEADERS.has(normalizedHeaders[i])) {
      nameIndex = i;
      break;
    }
  }

  if (nameIndex === -1) {
    return null;
  }

  const nameHeader = headers[nameIndex];
  const normalizedNameHeader = normalizeForMatching(nameHeader);
  const candidateStats = new Map<string, { total: number; matches: number }>();

  const registerCandidate = (key: string | undefined) => {
    if (!isHeaderlessKey(key)) return;
    if (!candidateStats.has(key)) {
      candidateStats.set(key, { total: 0, matches: 0 });
    }
  };

  registerCandidate(headers[nameIndex + 1]);

  const sampleLimit = Math.min(sampleRows.length, 25);
  for (let i = 0; i < sampleLimit; i += 1) {
    const row = sampleRows[i];
    if (!row || typeof row !== "object") continue;

    const keys = Object.keys(row);
    if (keys.length === 0) continue;

    const nameKeyIndex = keys.findIndex(
      (key) => normalizeForMatching(key) === normalizedNameHeader
    );
    if (nameKeyIndex === -1) continue;

    registerCandidate(keys[nameKeyIndex + 1]);
  }

  if (candidateStats.size === 0) {
    return null;
  }

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
      if (looksLikeGenderValue(str)) {
        stats.matches += 1;
      }
    }
  }

  let bestKey: string | null = null;
  let bestRatio = 0;
  for (const [key, stats] of candidateStats.entries()) {
    if (stats.matches === 0) continue;
    if (stats.total === 0) continue;

    const ratio = stats.matches / stats.total;
    if (
      stats.matches >= 3 ||
      (stats.total <= 3 && stats.matches === stats.total && stats.total >= 2)
    ) {
      if (ratio > bestRatio) {
        bestKey = key;
        bestRatio = ratio;
      }
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

function normalizeGenderValue(value: unknown, source: GenderSource | null): Gender {
  if (source === "fs_column" || source === "headerless_after_name") {
    return genderBlankToMF(value);
  }

  return normalizeGender(value);
}

function inferGenderForRow(
  row: Record<string, unknown>,
  config?: GenderColumnConfig | null,
  typeLabel?: string | null,
  groupLabel?: string | null
): GenderInference {
  const result: GenderInference = { gender: null, sources: [], warnings: [] };
  const candidates: Array<{ column: string; source: GenderSource }> = [];
  const seenColumns = new Set<string>();

  const addCandidate = (column: string | null | undefined, source: GenderSource) => {
    if (!column || seenColumns.has(column)) return;
    seenColumns.add(column);
    candidates.push({ column, source });
  };

  if (config?.preferredColumn) {
    addCandidate(config.preferredColumn, config.preferredSource ?? "gender_column");
  }
  addCandidate(config?.genderColumn, "gender_column");
  addCandidate(config?.fsColumn, "fs_column");
  addCandidate(config?.headerlessGenderColumn, "headerless_after_name");

  if (!config?.preferredColumn && "gender" in row) {
    addCandidate("gender", "gender_column");
  }

  for (const candidate of candidates) {
    const value = row[candidate.column];
    const normalized = normalizeGenderValue(value, candidate.source);
    if (normalized) {
      result.gender = normalized;
      result.sources.push(candidate.source);
      break;
    }
  }

  const hasFemaleType = hasFemaleMarker(typeLabel);
  const hasFemaleGroup = hasFemaleMarker(groupLabel);

  if (hasFemaleType || hasFemaleGroup) {
    if (result.gender === "M") {
      result.warnings.push("FMG overrides gender");
    }
    result.gender = "F";
    if (hasFemaleType) result.sources.push("type_label");
    if (hasFemaleGroup) result.sources.push("group_label");
  }

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const tournamentId = req.headers.get("x-tournament-id") ?? "";
  const providedHash = req.headers.get("x-sha256") ?? "";

  try {
    const start = performance.now();
    const { bytes, fileName, contentType } = await parseBody(req);
    const bufferSlice = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    console.log(`[import.srv] start bytes=${bytes.byteLength} name=${fileName}`);

    // TODO: Lock CORS to app origin in PR-114
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
    const rowsWithGender = dataRows.map((row) => {
      const genderInference = inferGenderForRow(row as Record<string, unknown>, genderConfig);
      return {
        ...row,
        _gender: genderInference.gender,
        _genderSources: genderInference.sources,
        _genderWarnings: genderInference.warnings
      };
    });

    const source = inferSource(trimmedHeaders, dataRows as Record<string, unknown>[]);
    const durationMs = Math.round(performance.now() - start);
    const rowCount = dataRows.length;

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
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "parse failed";
    console.error(`[import.srv] error message=${message}`);
    return new Response(JSON.stringify({ error: message }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
