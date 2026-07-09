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
