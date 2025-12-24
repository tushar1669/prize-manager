export interface PrizeAwardFlags {
  hasTrophy: boolean;
  hasMedal: boolean;
}

export interface PrizeAwardInput {
  hasTrophy?: boolean | null;
  hasMedal?: boolean | null;
}

export type PrizeAwardKind = 'trophy' | 'medal';

const AWARD_MARKERS = /(\s*(?:🏆|🥇|🥈|🥉|🏅|TROPHY|MEDAL)\s*)+/gi;

export function getAwardFlagsForPrizeRow(prize: PrizeAwardInput): PrizeAwardFlags {
  return {
    hasTrophy: Boolean(prize.hasTrophy),
    hasMedal: Boolean(prize.hasMedal),
  };
}

export function getAwardDisplayClasses(kind: PrizeAwardKind) {
  const baseClass = 'text-primary';

  return {
    iconClass: baseClass,
    labelClass: baseClass,
    label: kind === 'trophy' ? 'Trophy' : 'Medal',
  };
}

export function stripAwardMarkers(value: string): string {
  return value.replace(AWARD_MARKERS, ' ').replace(/\s{2,}/g, ' ').trim();
}
