/**
 * Dormant Team Ranking v2 INITIAL-finalization preflight, with no DB writes.
 *
 * The caller must independently query all active individual prize IDs for the
 * authenticated tournament and invoke the existing individual allocation engine
 * server-side with trusted tournament configuration (no browser winner list,
 * overrides or ruleConfigOverride). A complete preview contains one winner OR
 * one documented unfilled entry per active prize, never both.
 *
 * This PURE SHAPE/COMPLETENESS CHECK CANNOT prove player eligibility, the
 * authenticity of caller inputs, actual source DB contents, official rulings,
 * or an atomic same-version transaction. Do not treat it as Save authorization.
 */
type PreviewRow = Record<string, unknown>;
const obj = (value: unknown): value is PreviewRow =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');

export function hasCompleteInitialTeamV2IndividualPreview(
  activePrizeIds: readonly string[],
  preview: unknown,
): boolean {
  if (!Array.isArray(activePrizeIds) || activePrizeIds.length === 0 ||
      activePrizeIds.some(value => !id(value)) ||
      new Set(activePrizeIds).size !== activePrizeIds.length ||
      !obj(preview) || !Array.isArray(preview.winners) ||
      !Array.isArray(preview.unfilled) || !obj(preview.meta)) return false;

  const { winners, unfilled, meta } = preview;
  // A restricted dry-run preview may conceal winners; it is never finalization
  // evidence. Require the full server-scored response and matching counts.
  if (meta.dryRun !== false || meta.hiddenWinnersCount !== 0 ||
      meta.activePrizeCount !== activePrizeIds.length ||
      meta.winnersCount !== winners.length ||
      meta.unfilledCount !== unfilled.length ||
      winners.length === 0 ||
      winners.length + unfilled.length !== activePrizeIds.length) return false;

  const allowed = new Set(activePrizeIds);
  const seen = new Set<string>();
  for (const winner of winners) {
    if (!obj(winner) || !id(winner.prizeId) ||
        !id(winner.playerId) || !strings(winner.reasons) ||
        typeof winner.isManual !== 'boolean' ||
        !allowed.has(winner.prizeId) || seen.has(winner.prizeId)) return false;
    seen.add(winner.prizeId);
  }
  for (const unfilledRow of unfilled) {
    if (!obj(unfilledRow) || !id(unfilledRow.prizeId) ||
        !strings(unfilledRow.reasonCodes) ||
        !allowed.has(unfilledRow.prizeId) || seen.has(unfilledRow.prizeId)) return false;
    seen.add(unfilledRow.prizeId);
  }
  return seen.size === allowed.size;
}
