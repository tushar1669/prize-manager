export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export function normalizeGeminiModel(
  rawModel: string | undefined | null,
): string {
  const trimmed = rawModel?.trim() || DEFAULT_GEMINI_MODEL;
  const withoutPrefix = trimmed.replace(/^(?:models\/)+/i, "");
  return /^[A-Za-z0-9._-]+$/.test(withoutPrefix)
    ? withoutPrefix
    : DEFAULT_GEMINI_MODEL;
}

export function geminiGenerateContentUrl(
  model: string,
  apiKey: string,
): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

export function geminiHttpErrorCode(status: number): string {
  if (status === 400) return "provider_request_invalid";
  if (status === 401) return "provider_auth_failed";
  if (status === 403) return "provider_forbidden";
  if (status === 404) return "provider_model_not_found";
  if (status === 429) return "provider_rate_limited";
  if (status >= 500 && status <= 599) return "provider_unavailable";
  return "provider_http_error";
}

export type ProviderErrorCategory =
  | "schema_invalid"
  | "schema_too_complex"
  | "unsupported_field"
  | "unsupported_value"
  | "request_invalid"
  | "unknown";

export type ProviderErrorDiagnostics = {
  providerErrorStatus?: string;
  providerErrorCategory: ProviderErrorCategory;
  providerErrorFields?: string[];
};

const PROVIDER_ERROR_BODY_MAX_BYTES = 16_384;
const PROVIDER_ERROR_STATUS_RE = /^[A-Z0-9_]{1,64}$/;
const PROVIDER_ERROR_FIELD_RE = /^[A-Za-z0-9_.\-[\]]{1,200}$/;

export function providerErrorBodyMaxBytes(): number {
  return PROVIDER_ERROR_BODY_MAX_BYTES;
}

export async function readProviderErrorBodyCapped(
  response: Response,
  maxBytes = PROVIDER_ERROR_BODY_MAX_BYTES,
): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  let capped = false;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = maxBytes - total;
      if (value.byteLength > remaining) {
        chunks.push(value.slice(0, remaining));
        total = maxBytes;
        capped = true;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
    if (total >= maxBytes) capped = true;
  } catch (_) {
    return null;
  } finally {
    if (capped) {
      try {
        await reader.cancel();
      } catch (_) {
        /* ignore */
      }
    } else {
      try {
        reader.releaseLock();
      } catch (_) {
        /* ignore */
      }
    }
  }
  if (chunks.length === 0) return null;
  return new TextDecoder().decode(concatBytes(chunks, total));
}

function concatBytes(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function parseProviderErrorDiagnostics(
  bodyText: string | null,
): ProviderErrorDiagnostics {
  if (!bodyText) return { providerErrorCategory: "unknown" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch (_) {
    return { providerErrorCategory: "unknown" };
  }
  if (!parsed || typeof parsed !== "object")
    return { providerErrorCategory: "unknown" };
  const error = (parsed as { error?: unknown }).error;
  if (!error || typeof error !== "object")
    return { providerErrorCategory: "unknown" };
  const rec = error as {
    status?: unknown;
    message?: unknown;
    details?: unknown;
  };
  const providerErrorStatus =
    typeof rec.status === "string" && PROVIDER_ERROR_STATUS_RE.test(rec.status)
      ? rec.status
      : undefined;
  const providerErrorFields = extractProviderErrorFields(rec.details);
  const providerErrorCategory = classifyProviderError(
    typeof rec.message === "string" ? rec.message : "",
    providerErrorStatus,
  );
  return {
    ...(providerErrorStatus ? { providerErrorStatus } : {}),
    providerErrorCategory,
    ...(providerErrorFields.length > 0 ? { providerErrorFields } : {}),
  };
}

function extractProviderErrorFields(details: unknown): string[] {
  if (!Array.isArray(details)) return [];
  const out: string[] = [];
  for (const detail of details) {
    if (!detail || typeof detail !== "object") continue;
    const fieldViolations = (detail as { fieldViolations?: unknown })
      .fieldViolations;
    if (!Array.isArray(fieldViolations)) continue;
    for (const violation of fieldViolations) {
      if (!violation || typeof violation !== "object") continue;
      const field = (violation as { field?: unknown }).field;
      if (typeof field !== "string") continue;
      const trimmed = field.trim();
      if (!PROVIDER_ERROR_FIELD_RE.test(trimmed)) continue;
      out.push(trimmed);
      if (out.length >= 10) return out;
    }
  }
  return out;
}

function classifyProviderError(
  message: string,
  providerErrorStatus?: string,
): ProviderErrorCategory {
  const m = message.toLowerCase();
  if (
    /schema too complex|schema complexity|nesting depth|too many schema properties/.test(
      m,
    )
  )
    return "schema_too_complex";
  if (/unknown field|unknown name|unrecognized field|cannot find field/.test(m))
    return "unsupported_field";
  if (/invalid enum|enum value|unsupported type|invalid value/.test(m))
    return "unsupported_value";
  if (
    /responsejsonschema|response_json_schema|json schema|schema validation|schema property/.test(
      m,
    )
  )
    return "schema_invalid";
  if (providerErrorStatus === "INVALID_ARGUMENT") return "request_invalid";
  return "unknown";
}

/**
 * Parse a comma-separated fallback model list. Normalizes each entry, drops
 * blanks/invalids, and de-duplicates while preserving order. When `primary`
 * is provided, it is excluded from the returned list.
 */
export function parseFallbackModels(
  raw: string | undefined | null,
  primary?: string,
): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  if (primary) seen.add(primary);
  const out: string[] = [];
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const normalized = normalizeGeminiModel(trimmed);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

/**
 * Parse a Retry-After header value. Supports delta-seconds and HTTP-date.
 * Returns a non-negative integer seconds or null.
 */
export function parseRetryAfterSeconds(
  raw: string | null | undefined,
): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const diff = Math.ceil((dateMs - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  }
  return null;
}
