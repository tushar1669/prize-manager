import { describe, expect, it } from 'vitest';
import { applyReviewPreviewLimit, canDownloadAllocationExports } from '@/utils/reviewAccess';
import type { AllocationCoverageEntry } from '@/types/allocation';

const coverage: AllocationCoverageEntry[] = [
  {
    tournament_id: 't1',
    category_id: 'main',
    category_name: 'Main Prize',
    is_main: true,
    prize_id: 'p1',
    prize_place: 1,
    prize_label: 'Place 1',
    prize_type: 'cash',
    amount: 100,
    winner_player_id: 'a',
    winner_name: 'A',
    winner_rank: 1,
    candidates_before_one_prize: 10,
    candidates_after_one_prize: 10,
    is_unfilled: false,
    is_blocked_by_one_prize: false,
    reason_code: null,
    raw_fail_codes: [],
    diagnosis_summary: null,
    generated_at: '',
  },
  {
    tournament_id: 't1',
    category_id: 'main',
    category_name: 'Main Prize',
    is_main: true,
    prize_id: 'p2',
    prize_place: 2,
    prize_label: 'Place 2',
    prize_type: 'cash',
    amount: 80,
    winner_player_id: 'b',
    winner_name: 'B',
    winner_rank: 2,
    candidates_before_one_prize: 9,
    candidates_after_one_prize: 9,
    is_unfilled: false,
    is_blocked_by_one_prize: false,
    reason_code: null,
    raw_fail_codes: [],
    diagnosis_summary: null,
    generated_at: '',
  },
  {
    tournament_id: 't1',
    category_id: 'side',
    category_name: 'U1600',
    is_main: false,
    prize_id: 'p3',
    prize_place: 1,
    prize_label: 'Place 1',
    prize_type: 'cash',
    amount: 40,
    winner_player_id: 'c',
    winner_name: 'C',
    winner_rank: 20,
    candidates_before_one_prize: 5,
    candidates_after_one_prize: 5,
    is_unfilled: false,
    is_blocked_by_one_prize: false,
    reason_code: null,
    raw_fail_codes: [],
    diagnosis_summary: null,
    generated_at: '',
  },
];

describe('applyReviewPreviewLimit', () => {
  it('keeps only preview subset when full access is disabled', () => {
    const result = applyReviewPreviewLimit({
      canViewFullResults: false,
      previewMainLimit: 1,
      coverage,
      winners: [
        { prizeId: 'p1', playerId: 'a' },
        { prizeId: 'p2', playerId: 'b' },
        { prizeId: 'p3', playerId: 'c' },
      ],
      conflicts: [
        { impacted_prizes: ['p1', 'p2'] },
        { impacted_prizes: ['p3'] },
      ],
      unfilled: [
        { prizeId: 'p1' },
        { prizeId: 'p2' },
      ],
    });

    expect(result.coverage.map((entry) => entry.prize_id)).toEqual(['p1', 'p2', 'p3']);
    expect(result.winners.map((winner) => winner.prizeId)).toEqual(['p1', 'p3']);
    expect(result.conflicts).toHaveLength(2);
    expect(result.unfilled.map((entry) => entry.prizeId)).toEqual(['p1', 'p2']);
    expect(result.hiddenWinnerCount).toBe(1);
    expect(result.categoryPreview).toHaveLength(2);
  });

  it('returns full data when full access is enabled', () => {
    const result = applyReviewPreviewLimit({
      canViewFullResults: true,
      previewMainLimit: 1,
      coverage,
      winners: [{ prizeId: 'p1' }],
      conflicts: [{ impacted_prizes: ['p1'] }],
      unfilled: [{ prizeId: 'p1' }],
    });

    expect(result.coverage).toHaveLength(3);
    expect(result.winners).toHaveLength(1);
    expect(result.conflicts).toHaveLength(1);
    expect(result.unfilled).toHaveLength(1);
  });
});

describe('canDownloadAllocationExports', () => {
  it('blocks exports when paywalled', () => {
    const result = canDownloadAllocationExports({
      exportsEnabled: true,
      canViewFullResults: false,
      hasCoverage: true,
      hasRcaData: true,
    });

    expect(result.canDownloadCoverage).toBe(false);
    expect(result.canDownloadRca).toBe(false);
  });
});

