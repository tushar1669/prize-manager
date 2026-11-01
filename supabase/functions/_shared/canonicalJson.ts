/**
 * Order-insensitive JSON equality for values that round-trip through Postgres.
 *
 * A jsonb column does not keep the key order it was written with: Postgres
 * returns shorter keys first. A plain JSON.stringify comparison of a parsed
 * value against the stored one therefore fails for every real database row
 * even when both hold exactly the same fields. Object keys are sorted here;
 * array order is kept, because it is meaningful (e.g. tie-break order).
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const source = item as Record<string, unknown>;
    return Object.fromEntries(Object.keys(source).sort().map(key => [key, source[key]]));
  });
}

/** True when both values hold the same JSON content, ignoring object key order. */
export function sameJson(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
