export interface PrizeAwardFlags {
  hasTrophy: boolean;
  hasMedal: boolean;
}

export interface PrizeAwardInput {
  hasTrophy?: boolean | null;
  hasMedal?: boolean | null;
}

export function getAwardFlagsForPrizeRow(prize: PrizeAwardInput): PrizeAwardFlags {
  return {
    hasTrophy: Boolean(prize.hasTrophy),
    hasMedal: Boolean(prize.hasMedal),
  };
}
