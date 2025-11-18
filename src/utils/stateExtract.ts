// src/utils/stateExtract.ts
// Shared helpers for extracting state codes from identifiers

/**
 * Extract a 2-letter state code from an Ident-like string.
 * Handles Swiss-Manager style (e.g., "IND/KA/1234") and
 * leading-code formats (e.g., "MH123456").
 */
export function extractStateFromIdent(s: string): string | null {
  const ident = String(s ?? '').trim();
  if (!ident) return null;

  const upper = ident.toUpperCase();

  // Swiss-Manager style: IND/KA/NNNN → capture middle segment
  const parts = upper.split('/');
  if (parts.length >= 2) {
    const candidate = parts[1]?.trim();
    if (/^[A-Z]{2}$/.test(candidate)) {
      return candidate;
    }
  }

  // Leading code followed by digits (e.g., MH123456)
  const leadingMatch = upper.match(/^([A-Z]{2})(?=\d)/);
  if (leadingMatch) {
    const code = leadingMatch[1];
    const federations = new Set(['IN', 'US', 'GB', 'CN', 'RU', 'FR', 'DE', 'ES', 'IT', 'BR']);
    if (federations.has(code)) {
      console.warn(`[import.ident] Ident "${ident}" looks like Federation (${code}), not State. Please verify mapping.`);
    }
    return code;
  }

  return null;
}
