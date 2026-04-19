export const DEFAULT_FREE_PLAYER_THRESHOLD = 150;

export function resolveFreePlayerThreshold(value?: number | null): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  return DEFAULT_FREE_PLAYER_THRESHOLD;
}

export function exportUpgradeHint(threshold: number): string {
  return `PDF/print export is unavailable for tournaments above ${threshold} players without active Pro entitlement.`;
}
