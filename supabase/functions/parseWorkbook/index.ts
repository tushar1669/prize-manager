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

function scoreRow(row: unknown[]): number {
  const normalized = row.map(normalizeCell);
  let score = 0;

  const coreFields = ["rank", "name", "sno", "rtg", "irtg", "rating", "birth", "dob"];
  const coreHits = coreFields.filter((field) => normalized.some((cell) => cell.includes(field)));
  score += coreHits.length * 10;

  const secondaryFields = ["fide", "gender", "fed", "fs", "club", "state", "city"];
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
        const headers = row.map(normalizeHeader).filter((value) => value.length > 0);
        candidates.push({ sheetName, rowIndex, score, headers });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) {
    throw new Error("No valid header row found. Please ensure the file contains Rank and Name columns.");
  }
  return best;
}

function inferSource(headers: string[]): "swiss-manager" | "organizer-template" | "unknown" {
  const normalized = headers.map((header) => normalizeForMatching(header));
  const swiss = ["rank", "sno", "rtg", "fs", "fideno"];
  const template = ["rank", "name", "rating", "dob"];

  if (swiss.every((key) => normalized.includes(key))) return "swiss-manager";
  if (template.every((key) => normalized.includes(key))) return "organizer-template";
  return "unknown";
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
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

    const trimmedHeaders = headers.map(normalizeHeader);
    const dataRows = XLSX.utils.sheet_to_json(sheet, {
      header: trimmedHeaders,
      range: headerRowIndex + 1,
      raw: false,
      defval: ""
    }) as Record<string, unknown>[];

    const source = inferSource(trimmedHeaders);
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
      rows: dataRows,
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
