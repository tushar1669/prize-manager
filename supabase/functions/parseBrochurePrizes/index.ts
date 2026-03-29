import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import pdfParse from "npm:pdf-parse@1.1.1";
import { hasPingQueryParam, pingResponse, CORS_HEADERS } from "../_shared/health.ts";

const BUILD_VERSION = "2026-03-29T00:00:00Z";
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

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // Ping health check
  if (hasPingQueryParam(req)) {
    return pingResponse(FUNCTION_NAME, BUILD_VERSION);
  }

  try {
    // Auth: extract user from JWT
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

    // Service role client for storage + DB reads
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Parse input
    const body = await req.json().catch(() => ({}));
    const tournamentId = body.tournament_id;
    const selectedEvent: string | null = body.selected_event ?? null;

    if (!tournamentId || typeof tournamentId !== "string") {
      return jsonResponse({ error: "missing_tournament_id" }, 400);
    }

    // Auth: check ownership / master
    const accessDenied = await ensureTournamentAccess(supabase, user.id, tournamentId);
    if (accessDenied) return accessDenied;

    // Read brochure_url
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

    // File type detection
    const ext = getExtension(brochureUrl);

    if (IMAGE_EXTENSIONS.has(ext)) {
      console.log(`[${FUNCTION_NAME}] tournament_id=${tournamentId} status=unsupported_image_without_ocr`);
      return jsonResponse({ status: "unsupported_image_without_ocr" });
    }

    if (ext !== ".pdf") {
      console.log(`[${FUNCTION_NAME}] tournament_id=${tournamentId} status=unsupported_file_type ext=${ext}`);
      return jsonResponse({ status: "unsupported_file_type" });
    }

    // Download PDF from private bucket
    const { data: fileBlob, error: dlErr } = await supabase
      .storage
      .from("brochures")
      .download(brochureUrl);

    if (dlErr || !fileBlob) {
      console.log(`[${FUNCTION_NAME}] tournament_id=${tournamentId} status=download_failed`);
      return jsonResponse({ error: "download_failed", message: dlErr?.message ?? "Unknown" }, 500);
    }

    // Convert Blob → Buffer for pdf-parse
    const arrayBuffer = await fileBlob.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Extract text
    const pdfData = await pdfParse(buffer);
    const text: string = pdfData.text ?? "";
    const pageCount: number = pdfData.numpages ?? 0;
    const textLength = text.length;

    console.log(`[${FUNCTION_NAME}] tournament_id=${tournamentId} text_length=${textLength} page_count=${pageCount}`);

    // Scanned / image-only PDF check
    if (textLength < 100) {
      return jsonResponse({
        status: "scanned_or_image_only",
        text_length: textLength,
        page_count: pageCount,
      });
    }

    // Multi-event detection
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

    // Success
    return jsonResponse({
      status: "ok_text",
      page_count: pageCount,
      text_length: textLength,
      events,
      first_500_chars: text.slice(0, 500),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[${FUNCTION_NAME}] error: ${message}`);
    return jsonResponse({ error: "internal_error", message }, 500);
  }
});
