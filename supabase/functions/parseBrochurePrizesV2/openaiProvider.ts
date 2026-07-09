export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

export function normalizeOpenAIModel(rawModel: string | undefined | null): string {
  const trimmed = rawModel?.trim() || DEFAULT_OPENAI_MODEL;
  return /^[A-Za-z0-9._:-]+$/.test(trimmed) ? trimmed : DEFAULT_OPENAI_MODEL;
}

export function openaiHttpErrorCode(status: number): string {
  if (status === 401) return "provider_auth_failed";
  if (status === 403) return "provider_forbidden";
  if (status === 404) return "provider_model_not_found";
  if (status === 429) return "provider_rate_limited";
  if ([500, 502, 503, 504].includes(status)) return "provider_unavailable";
  return "provider_http_error";
}

export function openaiResponsesUrl(): string {
  return "https://api.openai.com/v1/responses";
}

export function extractOpenAIResponseText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  const output = Array.isArray(record.output) ? record.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as unknown[] : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string") chunks.push(text);
    }
  }
  return chunks.join("");
}
