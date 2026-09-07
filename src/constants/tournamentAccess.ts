export const DEFAULT_FREE_PLAYER_THRESHOLD = 150;

export function resolveFreePlayerThreshold(value?: number | null): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  return DEFAULT_FREE_PLAYER_THRESHOLD;
}

export function freeTierSummaryLabel(threshold: number): string {
  return `Free for tournaments up to ${threshold} players.`;
}

export function freeTierSummaryBody(threshold: number): string {
  return `Import your players first. If your tournament has ${threshold} or fewer players, Pro features are enabled automatically.`;
}

export function exportUpgradeHint(threshold: number): string {
  return `PDF/print export is unavailable for tournaments above ${threshold} players without active Pro entitlement.`;
}

export function printViewUpgradeCopy(viewName: string, threshold: number): string {
  return `Upgrade to Pro to access the ${viewName} view for tournaments with more than ${threshold} players.`;
}

/** TC1.6: free tier is capped at one active team prize group. */
export function teamPrizeGroupLimitHint(threshold: number): string {
  return `Free tier tournaments (${threshold} or fewer players) are limited to one team prize group. Upgrade to Pro to add more.`;
}
