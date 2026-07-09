export type ParserProvider = "gemini" | "openai";

const ALLOWED_PROVIDERS: ParserProvider[] = ["gemini", "openai"];

export function parseProviderChain(raw: string | undefined | null): ParserProvider[] {
  const value = raw?.trim() ? raw : "gemini";
  const seen = new Set<ParserProvider>();
  const out: ParserProvider[] = [];
  for (const entry of value.split(",")) {
    const normalized = entry.trim().toLowerCase() as ParserProvider;
    if (!ALLOWED_PROVIDERS.includes(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}
