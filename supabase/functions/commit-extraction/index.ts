/**
 * /commit-extraction — the single path from an approved extraction to production tables (PRD F8/F9).
 *
 * The gateway's verify_jwt only proves the caller holds a valid session; everything that decides
 * *whose* session may commit *which* extraction happens here: the caller must be the document's
 * uploader, and must hold the same role the app's tournament-creation UI gates on. The actual row
 * writes live in the commit_extraction_transaction RPC so they are one transaction with a
 * race-safe idempotency lock; this function never inserts a row itself.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, hasPingQueryParam } from "../_shared/health.ts";
import { MappingError, mapPayloadToTables, type ExtractionPayload } from "./mapper.ts";

const FUNCTION_NAME = "commit-extraction";
const BUILD_VERSION = "2026-07-17T18:00:00Z";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class CommitError extends Error {
  code: string;
  httpStatus: number;
  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "CommitError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function safeLog(fields: Record<string, string | number | boolean | null>): void {
  console.log(
    `[${FUNCTION_NAME}] ${Object.entries(fields).map(([k, v]) => `${k}=${String(v)}`).join(" ")}`,
  );
}

Deno.serve(async (req: Request) => {
  const startedMs = Date.now();

  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (hasPingQueryParam(req)) {
    return jsonResponse({ function: FUNCTION_NAME, status: "ok", buildVersion: BUILD_VERSION });
  }
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  let extractionId = "";

  try {
    const body = await req.json().catch(() => ({}));
    extractionId = typeof body?.extraction_id === "string" ? body.extraction_id.trim() : "";
    if (!UUID_RE.test(extractionId)) {
      throw new CommitError("invalid_extraction_id", "extraction_id must be a UUID", 400);
    }

    // ------------------------------------------------------------ who is calling
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await service.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      throw new CommitError("unauthorized", "Could not resolve the calling user", 401);
    }
    const callerId = userData.user.id;

    // -------------------------------------------------- extraction + its document
    const { data: extraction, error: extErr } = await service
      .from("extractions")
      .select("id, status, payload, linked_tournament_id, document_id")
      .eq("id", extractionId)
      .maybeSingle();
    if (extErr) throw new CommitError("extraction_lookup_failed", extErr.message, 500);
    if (!extraction) throw new CommitError("extraction_not_found", "No such extraction", 404);

    const { data: document, error: docErr } = await service
      .from("extraction_documents")
      .select("id, uploaded_by")
      .eq("id", extraction.document_id)
      .maybeSingle();
    if (docErr) throw new CommitError("document_lookup_failed", docErr.message, 500);
    if (!document) throw new CommitError("document_not_found", "Extraction has no document", 404);

    // ------------------------------------------------------------- authorization
    // A valid JWT is not authorization for this document (ARCHITECTURE.md D6): the caller must be
    // the uploader, and must pass the same role gate the app's Create Tournament button uses.
    if (document.uploaded_by !== callerId) {
      throw new CommitError("forbidden", "Only the uploader of this document can commit it", 403);
    }

    const { data: roleRow, error: roleErr } = await service
      .from("user_roles")
      .select("role, is_verified")
      .eq("user_id", callerId)
      .maybeSingle();
    if (roleErr) throw new CommitError("role_lookup_failed", roleErr.message, 500);
    const role = roleRow?.role ?? null;
    if (role !== "organizer" && role !== "master") {
      throw new CommitError("forbidden", "Your account is not allowed to create tournaments", 403);
    }

    // ------------------------------------------------------- idempotency fast path
    if (extraction.linked_tournament_id) {
      safeLog({ extraction_id: extractionId, already_committed: true, duration_ms: Date.now() - startedMs });
      return jsonResponse({
        tournament_id: extraction.linked_tournament_id,
        already_committed: true,
      });
    }

    if (extraction.status !== "needs_review" && extraction.status !== "auto_ok") {
      throw new CommitError(
        "extraction_not_committable",
        `Extraction status "${extraction.status}" cannot be committed`,
        409,
      );
    }

    // ------------------------------------------------------------------- mapping
    let mapped;
    try {
      mapped = mapPayloadToTables(extraction.payload as ExtractionPayload, callerId);
    } catch (err) {
      if (err instanceof MappingError) {
        throw new CommitError("payload_unmappable", err.message, 422);
      }
      throw err;
    }

    // ------------------------------------------------------------------- commit
    const { data: result, error: rpcErr } = await service.rpc("commit_extraction_transaction", {
      p_extraction_id: extractionId,
      p_reviewer_id: callerId,
      p_tournament: mapped.tournament,
      p_categories: mapped.categories,
    });
    if (rpcErr) throw new CommitError("commit_failed", rpcErr.message, 500);

    const row = Array.isArray(result) ? result[0] : result;
    const tournamentId = row?.tournament_id as string | undefined;
    if (!tournamentId) throw new CommitError("commit_failed", "Transaction returned no tournament id", 500);

    safeLog({
      extraction_id: extractionId,
      tournament_id: tournamentId,
      already_committed: row?.already_committed === true,
      categories: mapped.categories.length,
      prize_rows: mapped.categories.reduce((n, c) => n + c.prizes.length, 0),
      warnings: mapped.warnings.length,
      duration_ms: Date.now() - startedMs,
    });

    return jsonResponse({
      tournament_id: tournamentId,
      already_committed: row?.already_committed === true,
      warnings: mapped.warnings,
    });
  } catch (err) {
    const safeError = err instanceof CommitError
      ? err
      : new CommitError("unexpected_internal_error", err instanceof Error ? err.message : "Unknown error", 500);

    safeLog({
      extraction_id: extractionId || null,
      status: "error",
      code: safeError.code,
      duration_ms: Date.now() - startedMs,
    });

    return jsonResponse({ error: safeError.code, message: safeError.message }, safeError.httpStatus);
  }
});
