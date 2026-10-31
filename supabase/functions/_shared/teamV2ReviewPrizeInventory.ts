/** Fail-closed, read-only Team v2 ruling-review inventory comparison.
 * Inputs must be fetched independently: active DB group/prize records and
 * authenticated server scorer response. This is NOT a save/transaction guard.
 */
type Prize = {
  id: string; group_id: string; place: number; cash_amount: number;
  has_trophy: boolean; has_medal: boolean;
};
const obj = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x);
const positive = (x: unknown) => typeof x === 'number' &&
  Number.isSafeInteger(x) && x > 0;

export function verifyTeamV2ReviewPrizeInventory(
  groups: unknown, prizes: unknown, preview: unknown,
): boolean {
  if (!Array.isArray(groups) || !groups.length ||
      !Array.isArray(prizes) || !Array.isArray(preview)) return false;
  const expected = new Map<string, Map<string, Prize>>();
  for (const group of groups) {
    if (!obj(group) || typeof group.id !== 'string' || !group.id.trim() ||
        expected.has(group.id)) return false;
    expected.set(group.id, new Map());
  }
  const places = new Map<string, Set<number>>();
  for (const raw of prizes) {
    if (!obj(raw) || typeof raw.id !== 'string' || !raw.id.trim() ||
        typeof raw.group_id !== 'string' || !positive(raw.place) ||
        typeof raw.cash_amount !== 'number' || !Number.isFinite(raw.cash_amount) ||
        raw.cash_amount < 0 || typeof raw.has_trophy !== 'boolean' ||
        typeof raw.has_medal !== 'boolean') return false;
    const group = expected.get(raw.group_id);
    if (!group || group.has(raw.id)) return false;
    const used = places.get(raw.group_id) ?? new Set<number>();
    if (used.has(raw.place as number)) return false;
    used.add(raw.place as number);
    places.set(raw.group_id, used);
    group.set(raw.id, raw as Prize);
  }
  if (preview.length !== expected.size) return false;
  const seenGroups = new Set<string>();
  for (const group of preview) {
    if (!obj(group) || typeof group.group_id !== 'string' ||
        seenGroups.has(group.group_id) || !Array.isArray(group.prizes)) return false;
    const available = expected.get(group.group_id);
    if (!available || group.prizes.length !== available.size) return false;
    seenGroups.add(group.group_id);
    const seen = new Set<string>();
    for (const award of group.prizes) {
      if (!obj(award) || typeof award.id !== 'string' ||
          seen.has(award.id)) return false;
      seen.add(award.id);
      const db = available.get(award.id);
      if (!db || award.place !== db.place ||
          award.cash_amount !== db.cash_amount ||
          award.has_trophy !== db.has_trophy ||
          award.has_medal !== db.has_medal || award.is_active !== true) return false;
    }
  }
  return seenGroups.size === expected.size;
}
