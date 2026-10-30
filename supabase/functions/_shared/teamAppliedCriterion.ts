/**
 * Display the actual rule reported by the server for a v2 team award.
 * Legacy results, fixed total-points decisions and unverified imported TB
 * identities produce no extra label. Never infer that TB1 means Buchholz.
 */
export function teamAppliedCriterionLabel(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const audit = snapshot as Record<string, unknown>;
  if (audit.schema_version !== 2) return null;
  if (audit.decided_by_criterion === 'score_vector') return 'Highest individual scores';
  const criterion = audit.decided_by_criterion;
  if (typeof criterion !== 'string' || !/^TB[1-9]\d*$/.test(criterion)) return null;
  const ordinal = Number(criterion.slice(2));
  if (!Number.isSafeInteger(ordinal)) return null;

  const rules = audit.declared_rules;
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return null;
  const criteria = (rules as Record<string, unknown>).criteria;
  if (!Array.isArray(criteria)) return null;
  const match = criteria.find(rule =>
    rule && typeof rule === 'object' && !Array.isArray(rule) &&
    rule.kind === 'source_tb' && rule.ordinal === ordinal);
  if (!match || match.verified !== true || match.aggregation !== 'sum' ||
      (match.direction !== 'higher' && match.direction !== 'lower') ||
      typeof match.name !== 'string' || !match.name.trim()) return null;
  return `${criterion} · ${match.name.trim()}`;
}
