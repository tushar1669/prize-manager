import type { DraftResult, DraftCategory, DraftPrize } from "@/utils/prizeApplyDraft";

/**
 * Adapter for parseBrochurePrizesV2 (Gemini-only) function responses.
 *
 * Responsibilities:
 *  - Detect safe parser failures (HTTP 200 with `status === "parser_error"`).
 *  - Select a schema-compatible draft in the documented order:
 *      1. existing_draft_compat
 *      2. draft
 *      3. validated mapping from parser_result
 *  - Reject success payloads that contain no valid categories or prizes.
 *  - Never fabricate values.
 *  - Keep parser criteria review-only (criteria_json is intentionally {}).
 */

export interface ParserV2Metadata {
  jobId?: string;
  requestId?: string;
  schemaVersion?: string;
  blocked?: boolean;
  requiresReview?: boolean;
}

export interface ParserV2SuccessResult {
  ok: true;
  draft: DraftResult;
  parserMetadata: ParserV2Metadata;
}

export interface ParserV2ErrorResult {
  ok: false;
  code: string;
  stage?: string;
  message: string;
  requestId?: string;
  jobId?: string;
  retryAfterSeconds?: number | null;
}

export type ParserV2Result = ParserV2SuccessResult | ParserV2ErrorResult;

const USER_FACING_ERROR_COPY: Record<string, string> = {
  provider_unavailable:
    "AI parsing is temporarily unavailable. Try again later or use the existing parser or manual setup.",
  provider_rate_limited:
    "The AI parser is temporarily busy. Please wait and try again.",
  provider_model_not_found:
    "The AI parser model is unavailable. Please use the existing parser or manual setup.",
  provider_auth_failed:
    "The AI parser is not configured correctly. Please contact support.",
  provider_forbidden:
    "The AI parser is not configured correctly. Please contact support.",
  provider_response_invalid:
    "The brochure could not be converted into a safe prize draft. Try another file or use manual setup.",
  provider_output_invalid:
    "The brochure could not be converted into a safe prize draft. Try another file or use manual setup.",
  storage_download_failed:
    "The uploaded brochure could not be read. Re-upload it and try again.",
  unexpected_internal_error:
    "The AI parser encountered an unexpected error. Please try again later.",
};

const FALLBACK_ERROR_COPY =
  "The brochure could not be parsed safely. No changes were made.";

export function userFacingErrorMessage(code: string | undefined | null): string {
  if (!code) return FALLBACK_ERROR_COPY;
  return USER_FACING_ERROR_COPY[code] ?? FALLBACK_ERROR_COPY;
}

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

function coerceGiftItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  for (const it of items) {
    if (typeof it === "string" && it.trim()) {
      out.push(it.trim());
    } else if (it && typeof it === "object") {
      const rec = it as { name?: unknown; qty?: unknown };
      if (isNonEmptyString(rec.name)) {
        const qty = isFiniteNumber(rec.qty) && rec.qty > 1 ? Math.floor(rec.qty) : 1;
        out.push(qty > 1 ? `${rec.name.trim()} x${qty}` : rec.name.trim());
      }
    }
  }
  return out;
}

function coercePrize(p: unknown): DraftPrize | null {
  if (!p || typeof p !== "object") return null;
  const rec = p as Record<string, unknown>;
  const placeRaw = rec.place;
  const place =
    isFiniteNumber(placeRaw) && placeRaw > 0 ? Math.floor(placeRaw) : null;
  if (place === null) return null;
  const cash = isFiniteNumber(rec.cash_amount) ? rec.cash_amount : 0;
  return {
    place,
    cash_amount: cash,
    has_trophy: rec.has_trophy === true,
    has_medal: rec.has_medal === true,
    gift_items: coerceGiftItems(rec.gift_items),
    confidence: isNonEmptyString(rec.confidence) ? rec.confidence : "LOW",
    source_text: isNonEmptyString(rec.source_text)
      ? rec.source_text
      : isNonEmptyString(rec.source_text_excerpt)
        ? (rec.source_text_excerpt as string)
        : "",
  };
}

function coerceCategory(c: unknown, index: number): DraftCategory | null {
  if (!c || typeof c !== "object") return null;
  const rec = c as Record<string, unknown>;
  if (!isNonEmptyString(rec.name)) return null;
  const prizesRaw = Array.isArray(rec.prizes) ? rec.prizes : [];
  const prizes = prizesRaw
    .map(coercePrize)
    .filter((p): p is DraftPrize => p !== null);
  return {
    name: rec.name.trim(),
    is_main: rec.is_main === true,
    order_idx: isFiniteNumber(rec.order_idx) ? rec.order_idx : index,
    confidence: isNonEmptyString(rec.confidence) ? rec.confidence : "LOW",
    warnings: Array.isArray(rec.warnings)
      ? rec.warnings.filter(isNonEmptyString)
      : [],
    // Keep criteria review-only. Do NOT persist parser criteria suggestions.
    criteria_json: {},
    prizes,
  };
}

function coerceDraft(candidate: unknown): DraftResult | null {
  if (!candidate || typeof candidate !== "object") return null;
  const rec = candidate as Record<string, unknown>;
  const catsRaw = Array.isArray(rec.categories) ? rec.categories : [];
  const categories = catsRaw
    .map((c, i) => coerceCategory(c, i))
    .filter((c): c is DraftCategory => c !== null);
  const totalPrizes = categories.reduce((s, c) => s + c.prizes.length, 0);
  if (categories.length === 0 || totalPrizes === 0) return null;
  return {
    source: isNonEmptyString(rec.source) ? rec.source : "pdf",
    file_path: isNonEmptyString(rec.file_path) ? rec.file_path : "",
    overall_confidence: isNonEmptyString(rec.overall_confidence)
      ? rec.overall_confidence
      : "LOW",
    warnings: Array.isArray(rec.warnings)
      ? rec.warnings.filter(isNonEmptyString)
      : [],
    categories,
    team_groups: [],
  };
}

/** Normalize a parseBrochurePrizesV2 payload into a discriminated result. */
export function normalizeParserV2Response(payload: unknown): ParserV2Result {
  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      code: "provider_response_invalid",
      message: userFacingErrorMessage("provider_response_invalid"),
    };
  }
  const rec = payload as Record<string, unknown>;

  // HTTP 200 safe parser failure — must not be treated as success.
  if (rec.status === "parser_error") {
    const code = isNonEmptyString(rec.code) ? rec.code : "unexpected_internal_error";
    return {
      ok: false,
      code,
      stage: isNonEmptyString(rec.stage) ? rec.stage : undefined,
      message: userFacingErrorMessage(code),
      requestId: isNonEmptyString(rec.request_id) ? rec.request_id : undefined,
      jobId: isNonEmptyString(rec.job_id) ? rec.job_id : undefined,
      retryAfterSeconds:
        isFiniteNumber(rec.retry_after_seconds) ? rec.retry_after_seconds : null,
    };
  }

  // Non-parser-error, non-ok statuses (e.g. no_brochure, unsupported_file_type,
  // not_enabled) — surface as a safe failure, don't open the review dialog.
  if (rec.status && rec.status !== "ok_draft" && rec.status !== "blocked_low_confidence") {
    const statusStr = String(rec.status);
    const code =
      statusStr === "no_brochure"
        ? "storage_download_failed"
        : "provider_response_invalid";
    return {
      ok: false,
      code,
      stage: isNonEmptyString(rec.stage) ? rec.stage : undefined,
      message: userFacingErrorMessage(code),
      jobId: isNonEmptyString(rec.job_id) ? rec.job_id : undefined,
    };
  }

  // Selection order: existing_draft_compat → draft → parser_result
  const candidates: unknown[] = [
    rec.existing_draft_compat,
    rec.draft,
    rec.parser_result,
  ];
  let draft: DraftResult | null = null;
  for (const cand of candidates) {
    draft = coerceDraft(cand);
    if (draft) break;
  }
  if (!draft) {
    return {
      ok: false,
      code: "provider_output_invalid",
      message: userFacingErrorMessage("provider_output_invalid"),
      jobId: isNonEmptyString(rec.job_id) ? rec.job_id : undefined,
    };
  }

  return {
    ok: true,
    draft,
    parserMetadata: {
      jobId: isNonEmptyString(rec.job_id) ? rec.job_id : undefined,
      requestId: isNonEmptyString(rec.request_id) ? rec.request_id : undefined,
      schemaVersion: isNonEmptyString(rec.schema_version)
        ? rec.schema_version
        : undefined,
      blocked: rec.blocked === true,
      requiresReview: rec.requires_review === true,
    },
  };
}

/** Shortened support reference id, safe for user display. */
export function shortSupportRef(id: string | undefined | null): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  return trimmed.length > 8 ? trimmed.slice(0, 8) : trimmed;
}
