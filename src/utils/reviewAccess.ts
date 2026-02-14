import type { AllocationCoverageEntry } from "@/types/allocation";

type WinnerLike = {
  prizeId: string;
};

type ConflictLike = {
  impacted_prizes: string[];
};

type UnfilledLike = {
  prizeId: string;
};

export interface ReviewPreviewInput<TWinner extends WinnerLike, TConflict extends ConflictLike, TUnfilled extends UnfilledLike> {
  canViewFullResults: boolean;
  previewMainLimit: number;
  coverage: AllocationCoverageEntry[];
  winners: TWinner[];
  conflicts: TConflict[];
  unfilled: TUnfilled[];
}

export function applyReviewPreviewLimit<
  TWinner extends WinnerLike,
  TConflict extends ConflictLike,
  TUnfilled extends UnfilledLike,
>({
  canViewFullResults,
  previewMainLimit,
  coverage,
  winners,
  conflicts,
  unfilled,
}: ReviewPreviewInput<TWinner, TConflict, TUnfilled>) {
  if (canViewFullResults) {
    return { coverage, winners, conflicts, unfilled };
  }

  const visibleCoverage = coverage.filter(
    (entry) => entry.is_main && entry.prize_place <= previewMainLimit,
  );
  const visiblePrizeIds = new Set(visibleCoverage.map((entry) => entry.prize_id));

  return {
    coverage: visibleCoverage,
    winners: winners.filter((winner) => visiblePrizeIds.has(winner.prizeId)),
    conflicts: conflicts.filter((conflict) =>
      conflict.impacted_prizes.some((prizeId) => visiblePrizeIds.has(prizeId)),
    ),
    unfilled: unfilled.filter((entry) => visiblePrizeIds.has(entry.prizeId)),
  };
}

export function canDownloadAllocationExports({
  exportsEnabled,
  canViewFullResults,
  hasCoverage,
  hasRcaData,
}: {
  exportsEnabled: boolean;
  canViewFullResults: boolean;
  hasCoverage: boolean;
  hasRcaData: boolean;
}) {
  const canDownloadCoverage = exportsEnabled && canViewFullResults && hasCoverage;
  const canDownloadRca = exportsEnabled && canViewFullResults && hasCoverage && hasRcaData;

  return {
    canDownloadCoverage,
    canDownloadRca,
  };
}

