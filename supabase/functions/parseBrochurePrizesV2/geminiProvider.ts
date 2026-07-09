export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export function normalizeGeminiModel(rawModel: string | undefined | null): string {
  const trimmed = rawModel?.trim() || DEFAULT_GEMINI_MODEL;
  const withoutPrefix = trimmed.replace(/^(?:models\/)+/i, "");
  return /^[A-Za-z0-9._-]+$/.test(withoutPrefix) ? withoutPrefix : DEFAULT_GEMINI_MODEL;
}

export function geminiGenerateContentUrl(model: string, apiKey: string): string {
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

/**
 * Parse a comma-separated fallback model list. Normalizes each entry, drops
 * blanks/invalids, and de-duplicates while preserving order. When `primary`
 * is provided, it is excluded from the returned list.
 */
export function parseFallbackModels(raw: string | undefined | null, primary?: string): string[] {
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
export function parseRetryAfterSeconds(raw: string | null | undefined): number | null {
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
