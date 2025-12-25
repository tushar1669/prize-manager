import { test, expect } from '@playwright/test';
import { compareEligibleByRankRatingName } from '../supabase/functions/allocatePrizes/index';

function makeCandidate(rank: number | null, rating: number | null, name: string) {
  return { player: { rank, rating, name } } as unknown;
}

test.describe('Allocator: Deterministic Tie-Breaking', () => {
  test('AC Case A: resolves by name when ranks and top ratings tie', () => {
    // ranks [1,1,1], ratings [2100,2100,1900], names ['Amit','Bala','Chirag']
    // Expected: Amit (name ASC between Amit & Bala who both have rating 2100)
    const arr = [
      makeCandidate(1, 2100, 'Bala'),
      makeCandidate(1, 2100, 'Amit'),
      makeCandidate(1, 1900, 'Chirag'),
    ];
    
    arr.sort(compareEligibleByRankRatingName);
    
    expect(arr[0].player.name).toBe('Amit');
    expect(arr[1].player.name).toBe('Bala');
    expect(arr[2].player.name).toBe('Chirag');
  });

  test('AC Case B: resolves by rating when ranks tie but ratings differ', () => {
    // ranks [1,1,1], ratings [2100,2050,2100], names ['Zed','Amit','Bala']
    // Expected: Bala or Zed (both rating=2100), but Bala < Zed alphabetically
    const arr = [
      makeCandidate(1, 2050, 'Amit'),
      makeCandidate(1, 2100, 'Zed'),
      makeCandidate(1, 2100, 'Bala'),
    ];
    
    arr.sort(compareEligibleByRankRatingName);
    
    // Winner should have rating 2100
    expect(arr[0].player.rating).toBe(2100);
    
    // Among 2100s, Bala < Zed by name
    expect(arr[0].player.name).toBe('Bala');
    expect(arr[1].player.name).toBe('Zed');
    expect(arr[2].player.name).toBe('Amit');
  });

  test('no tie-break needed when ranks differ', () => {
    const arr = [
      makeCandidate(3, 2200, 'Charlie'),
      makeCandidate(1, 1800, 'Alice'),
      makeCandidate(2, 2100, 'Bob'),
    ];

    arr.sort(compareEligibleByRankRatingName);

    // Should sort by rank only
    expect(arr[0].player.name).toBe('Alice'); // rank 1
    expect(arr[1].player.name).toBe('Bob');   // rank 2
    expect(arr[2].player.name).toBe('Charlie'); // rank 3
  });

  test('supports disabling tie-breaks via strategy "none"', () => {
    const arr = [
      makeCandidate(1, 2200, 'Bala'),
      makeCandidate(1, 2300, 'Amit'),
      makeCandidate(1, 2100, 'Chirag'),
    ];

    arr.sort((a, b) => compareEligibleByRankRatingName(a, b, 'none'));

    // With rank-only tie-breaks, original order is preserved
    expect(arr[0].player.name).toBe('Bala');
    expect(arr[1].player.name).toBe('Amit');
    expect(arr[2].player.name).toBe('Chirag');
  });

  test('supports custom tie-break arrays', () => {
    const arr = [
      makeCandidate(1, 2000, 'Zara'),
      makeCandidate(1, 2100, 'Mira'),
      makeCandidate(1, 1900, 'Aditi'),
    ];

    arr.sort((a, b) => compareEligibleByRankRatingName(a, b, ['name']));

    expect(arr[0].player.name).toBe('Aditi');
    expect(arr[1].player.name).toBe('Mira');
    expect(arr[2].player.name).toBe('Zara');
  });
});
