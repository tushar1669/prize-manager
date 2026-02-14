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

export interface CategoryPreviewMeta {
  categoryId: string;
  categoryName: string;
  totalWinners: number;
  visibleWinners: number;
  hiddenWinners: number;
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
  void previewMainLimit;

  if (canViewFullResults) {
    return {
      coverage,
      winners,
      conflicts,
      unfilled,
      categoryPreview: [] as CategoryPreviewMeta[],
      hiddenWinnerCount: 0,
    };
  }

  const categoryPrizeMap = new Map<
    string,
    { categoryName: string; winnerPrizeIds: string[] }
  >();

  for (const entry of coverage) {
    const categoryId = entry.category_id ?? entry.category_name ?? "unknown";
    if (!categoryPrizeMap.has(categoryId)) {
      categoryPrizeMap.set(categoryId, {
        categoryName: entry.category_name,
        winnerPrizeIds: [],
      });
    }

    if (!entry.is_unfilled && entry.prize_id) {
      categoryPrizeMap.get(categoryId)?.winnerPrizeIds.push(entry.prize_id);
    }
  }

  const visiblePrizeIds = new Set<string>();
  const categoryPreview: CategoryPreviewMeta[] = [];

  for (const [categoryId, data] of categoryPrizeMap.entries()) {
    const totalWinners = data.winnerPrizeIds.length;
    const visibleWinners = totalWinners <= 5 ? Math.min(totalWinners, 1) : Math.ceil(totalWinners * 0.5);

    data.winnerPrizeIds.slice(0, visibleWinners).forEach((prizeId) => {
      visiblePrizeIds.add(prizeId);
    });

    categoryPreview.push({
      categoryId,
      categoryName: data.categoryName,
      totalWinners,
      visibleWinners,
      hiddenWinners: Math.max(0, totalWinners - visibleWinners),
    });
  }

  return {
    coverage,
    winners: winners.filter((winner) => visiblePrizeIds.has(winner.prizeId)),
    conflicts,
    unfilled,
    categoryPreview,
    hiddenWinnerCount: winners.filter((winner) => !visiblePrizeIds.has(winner.prizeId)).length,
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
