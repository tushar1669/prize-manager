export interface PrizeAwardFlags {
  hasTrophy: boolean;
  hasMedal: boolean;
}

export interface PrizeAwardInput {
  hasTrophy?: boolean | null;
  hasMedal?: boolean | null;
}

export type PrizeAwardKind = 'trophy' | 'medal';

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
