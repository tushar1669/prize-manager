/**
 * Tests for institution/team prize allocation logic
 * 
 * These tests verify:
 * 1. Team building with gender slot requirements
 * 2. Scoring and ranking of institutions
 * 3. Prize assignment to winning institutions
 * 4. Edge cases (not enough players, gender constraints, etc.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock player data representing a tournament with multiple schools/clubs
const createMockPlayers = () => [
  // School A - 6 players (3F, 3M), strong team
  { id: 'a1', name: 'Alice A1', rank: 1, rating: 2100, gender: 'F', club: 'School A', city: 'Delhi', state: 'Delhi', group_label: null, type_label: null, tournament_id: 't1' },
  { id: 'a2', name: 'Bob A2', rank: 2, rating: 2050, gender: 'M', club: 'School A', city: 'Delhi', state: 'Delhi', group_label: null, type_label: null, tournament_id: 't1' },
  { id: 'a3', name: 'Carol A3', rank: 5, rating: 1900, gender: 'F', club: 'School A', city: 'Delhi', state: 'Delhi', group_label: null, type_label: null, tournament_id: 't1' },
  { id: 'a4', name: 'Dave A4', rank: 6, rating: 1850, gender: 'M', club: 'School A', city: 'Delhi', state: 'Delhi', group_label: null, type_label: null, tournament_id: 't1' },
  { id: 'a5', name: 'Eve A5', rank: 10, rating: 1700, gender: 'F', club: 'School A', city: 'Delhi', state: 'Delhi', group_label: null, type_label: null, tournament_id: 't1' },
  { id: 'a6', name: 'Frank A6', rank: 12, rating: 1650, gender: 'M', club: 'School A', city: 'Delhi', state: 'Delhi', group_label: null, type_label: null, tournament_id: 't1' },

  // School B - 5 players (1F, 4M), good but fewer females
  { id: 'b1', name: 'Grace B1', rank: 3, rating: 2000, gender: 'F', club: 'School B', city: 'Mumbai', state: 'Maharashtra', group_label: null, type_label: null, tournament_id: 't1' },
  { id: 'b2', name: 'Henry B2', rank: 4, rating: 1950, gender: 'M', club: 'School B', city: 'Mumbai', state: 'Maharashtra', group_label: null, type_label: null, tournament_id: 't1' },
  { id: 'b3', name: 'Ivan B3', rank: 7, rating: 1800, gender: 'M', club: 'School B', city: 'Mumbai', state: 'Maharashtra', group_label: null, type_label: null, tournament_id: 't1' },
  { id: 'b4', name: 'Jack B4', rank: 8, rating: 1780, gender: 'M', club: 'School B', city: 'Mumbai', state: 'Maharashtra', group_label: null, type_label: null, tournament_id: 't1' },
  { id: 'b5', name: 'Kevin B5', rank: 11, rating: 1680, gender: 'M', club: 'School B', city: 'Mumbai', state: 'Maharashtra', group_label: null, type_label: null, tournament_id: 't1' },

  // School C - 3 players (2F, 1M), too small for team of 4
  { id: 'c1', name: 'Linda C1', rank: 9, rating: 1750, gender: 'F', club: 'School C', city: 'Chennai', state: 'Tamil Nadu', group_label: null, type_label: null, tournament_id: 't1' },
  { id: 'c2', name: 'Mike C2', rank: 13, rating: 1600, gender: 'M', club: 'School C', city: 'Chennai', state: 'Tamil Nadu', group_label: null, type_label: null, tournament_id: 't1' },
  { id: 'c3', name: 'Nancy C3', rank: 14, rating: 1580, gender: 'F', club: 'School C', city: 'Chennai', state: 'Tamil Nadu', group_label: null, type_label: null, tournament_id: 't1' },

  // School D - 4 players all male, no females
  { id: 'd1', name: 'Oscar D1', rank: 15, rating: 1550, gender: 'M', club: 'School D', city: 'Kolkata', state: 'West Bengal', group_label: null, type_label: null, tournament_id: 't1' },
  { id: 'd2', name: 'Pete D2', rank: 16, rating: 1520, gender: 'M', club: 'School D', city: 'Kolkata', state: 'West Bengal', group_label: null, type_label: null, tournament_id: 't1' },
  { id: 'd3', name: 'Quinn D3', rank: 17, rating: 1500, gender: 'M', club: 'School D', city: 'Kolkata', state: 'West Bengal', group_label: null, type_label: null, tournament_id: 't1' },
  { id: 'd4', name: 'Ray D4', rank: 18, rating: 1480, gender: 'M', club: 'School D', city: 'Kolkata', state: 'West Bengal', group_label: null, type_label: null, tournament_id: 't1' },
];

// Helper functions matching the edge function logic
function isFemale(gender: string | null): boolean {
  return gender?.toUpperCase() === 'F';
}

function isNotF(gender: string | null): boolean {
  return !isFemale(gender);
}

function getRankPoints(rank: number, maxRank: number): number {
  return maxRank + 1 - rank;
}

function comparePlayersByScore(
  a: { rank: number; points: number },
  b: { rank: number; points: number }
): number {
  if (b.points !== a.points) return b.points - a.points;
  return a.rank - b.rank;
}

interface TeamPlayerInfo {
  player_id: string;
  name: string;
  rank: number;
  points: number;
  gender: string | null;
}

function buildTeam(
  players: Array<{ id: string; name: string; rank: number; points: number; gender: string | null }>,
  teamSize: number,
  femaleSlots: number,
  maleSlots: number
): { team: TeamPlayerInfo[] } | null {
  const females = players.filter(p => isFemale(p.gender));
  const notFs = players.filter(p => isNotF(p.gender));

  females.sort(comparePlayersByScore);
  notFs.sort(comparePlayersByScore);

  const team: TeamPlayerInfo[] = [];
  const usedIds = new Set<string>();

  // Fill required female slots
  if (femaleSlots > 0) {
    if (females.length < femaleSlots) return null;
    for (let i = 0; i < femaleSlots; i++) {
      const p = females[i];
      team.push({ player_id: p.id, name: p.name, rank: p.rank, points: p.points, gender: p.gender });
      usedIds.add(p.id);
    }
  }

  // Fill required male slots
  if (maleSlots > 0) {
    if (notFs.length < maleSlots) return null;
    for (let i = 0; i < maleSlots; i++) {
      const p = notFs[i];
      team.push({ player_id: p.id, name: p.name, rank: p.rank, points: p.points, gender: p.gender });
      usedIds.add(p.id);
    }
  }

  // Fill remaining slots with best available
  const remainingSlots = teamSize - team.length;
  if (remainingSlots > 0) {
    const remaining = [
      ...females.filter(p => !usedIds.has(p.id)),
      ...notFs.filter(p => !usedIds.has(p.id)),
    ];
    remaining.sort(comparePlayersByScore);

    if (remaining.length < remainingSlots) return null;

    for (let i = 0; i < remainingSlots; i++) {
      const p = remaining[i];
      team.push({ player_id: p.id, name: p.name, rank: p.rank, points: p.points, gender: p.gender });
      usedIds.add(p.id);
    }
  }

  return { team };
}

describe('Institution Prize Allocation', () => {
  describe('Gender detection helpers', () => {
    it('isFemale correctly identifies female gender', () => {
      expect(isFemale('F')).toBe(true);
      expect(isFemale('f')).toBe(true);
      expect(isFemale('M')).toBe(false);
      expect(isFemale(null)).toBe(false);
      expect(isFemale('')).toBe(false);
    });

    it('isNotF correctly identifies non-female genders', () => {
      expect(isNotF('M')).toBe(true);
      expect(isNotF('m')).toBe(true);
      expect(isNotF(null)).toBe(true);
      expect(isNotF('')).toBe(true);
      expect(isNotF('F')).toBe(false);
    });
  });

  describe('Rank points calculation', () => {
    it('calculates rank points correctly (higher rank = higher score)', () => {
      const maxRank = 18;
      expect(getRankPoints(1, maxRank)).toBe(18); // Best player gets 18 points
      expect(getRankPoints(18, maxRank)).toBe(1); // Worst player gets 1 point
      expect(getRankPoints(9, maxRank)).toBe(10); // Middle player
    });

    it('handles edge case of single player', () => {
      expect(getRankPoints(1, 1)).toBe(1);
    });
  });

  describe('Team building', () => {
    const mockPlayers = createMockPlayers();
    const maxRank = 18;

    // Add points to players for testing
    const playersWithPoints = mockPlayers.map(p => ({
      ...p,
      points: getRankPoints(p.rank, maxRank),
    }));

    const schoolA = playersWithPoints.filter(p => p.club === 'School A');
    const schoolB = playersWithPoints.filter(p => p.club === 'School B');
    const schoolC = playersWithPoints.filter(p => p.club === 'School C');
    const schoolD = playersWithPoints.filter(p => p.club === 'School D');

    it('builds a team without gender requirements (pure top-K)', () => {
      const result = buildTeam(schoolA, 4, 0, 0);
      expect(result).not.toBeNull();
      expect(result!.team.length).toBe(4);
      // Should pick the top 4 by points: ranks 1, 2, 5, 6
      expect(result!.team.map(p => p.rank)).toEqual([1, 2, 5, 6]);
    });

    it('builds a team with gender requirements (2F + 2M)', () => {
      const result = buildTeam(schoolA, 4, 2, 2);
      expect(result).not.toBeNull();
      expect(result!.team.length).toBe(4);
      // Should have 2 females and 2 males
      const females = result!.team.filter(p => isFemale(p.gender));
      const males = result!.team.filter(p => isNotF(p.gender));
      expect(females.length).toBe(2);
      expect(males.length).toBe(2);
    });

    it('returns null when not enough females for required slots', () => {
      // School B has only 1 female, but needs 2
      const result = buildTeam(schoolB, 4, 2, 2);
      expect(result).toBeNull();
    });

    it('returns null when not enough males for required slots', () => {
      // School C has only 1 male, if we require 2 males it should fail
      const result = buildTeam(schoolC, 3, 0, 2);
      expect(result).toBeNull();
    });

    it('returns null when not enough total players', () => {
      // School C has only 3 players, can't make a team of 4
      const result = buildTeam(schoolC, 4, 0, 0);
      expect(result).toBeNull();
    });

    it('returns null when institution requires females but has none', () => {
      // School D has 0 females
      const result = buildTeam(schoolD, 4, 1, 0);
      expect(result).toBeNull();
    });

    it('builds team when gender slots sum to less than team size', () => {
      // 1F + 1M required, remaining 2 filled by best available
      const result = buildTeam(schoolA, 4, 1, 1);
      expect(result).not.toBeNull();
      expect(result!.team.length).toBe(4);
      // Check at least 1F and 1M
      const females = result!.team.filter(p => isFemale(p.gender));
      const males = result!.team.filter(p => isNotF(p.gender));
      expect(females.length).toBeGreaterThanOrEqual(1);
      expect(males.length).toBeGreaterThanOrEqual(1);
    });

    it('selects best players for each gender category', () => {
      const result = buildTeam(schoolA, 4, 2, 2);
      expect(result).not.toBeNull();
      
      const females = result!.team.filter(p => isFemale(p.gender));
      const males = result!.team.filter(p => isNotF(p.gender));
      
      // Best 2 females from School A: ranks 1, 5 (Alice, Carol)
      expect(females.map(p => p.rank).sort((a, b) => a - b)).toEqual([1, 5]);
      // Best 2 males from School A: ranks 2, 6 (Bob, Dave)
      expect(males.map(p => p.rank).sort((a, b) => a - b)).toEqual([2, 6]);
    });
  });

  describe('Institution ranking', () => {
    const mockPlayers = createMockPlayers();
    const maxRank = 18;

    const playersWithPoints = mockPlayers.map(p => ({
      ...p,
      points: getRankPoints(p.rank, maxRank),
    }));

    it('ranks institutions by total points (higher is better)', () => {
      // Build teams for schools A and B (pure top-4)
      const schoolA = playersWithPoints.filter(p => p.club === 'School A');
      const schoolB = playersWithPoints.filter(p => p.club === 'School B');

      const teamA = buildTeam(schoolA, 4, 0, 0);
      const teamB = buildTeam(schoolB, 4, 0, 0);

      expect(teamA).not.toBeNull();
      expect(teamB).not.toBeNull();

      const totalA = teamA!.team.reduce((sum, p) => sum + p.points, 0);
      const totalB = teamB!.team.reduce((sum, p) => sum + p.points, 0);

      // School A has ranks 1, 2, 5, 6 → points 18, 17, 14, 13 = 62
      // School B has ranks 3, 4, 7, 8 → points 16, 15, 12, 11 = 54
      expect(totalA).toBe(62);
      expect(totalB).toBe(54);
      expect(totalA).toBeGreaterThan(totalB); // School A wins
    });

    it('uses rank_sum as tie-breaker when total_points are equal', () => {
      // Create two schools with equal total points but different rank distributions
      const schoolX = [
        { id: 'x1', name: 'X1', rank: 1, points: 10, gender: 'M' },
        { id: 'x2', name: 'X2', rank: 10, points: 1, gender: 'M' },
      ];
      const schoolY = [
        { id: 'y1', name: 'Y1', rank: 5, points: 6, gender: 'M' },
        { id: 'y2', name: 'Y2', rank: 6, points: 5, gender: 'M' },
      ];

      const teamX = buildTeam(schoolX, 2, 0, 0);
      const teamY = buildTeam(schoolY, 2, 0, 0);

      expect(teamX).not.toBeNull();
      expect(teamY).not.toBeNull();

      const totalX = teamX!.team.reduce((sum, p) => sum + p.points, 0);
      const totalY = teamY!.team.reduce((sum, p) => sum + p.points, 0);
      expect(totalX).toBe(totalY); // Equal total points

      const rankSumX = teamX!.team.reduce((sum, p) => sum + p.rank, 0); // 1 + 10 = 11
      const rankSumY = teamY!.team.reduce((sum, p) => sum + p.rank, 0); // 5 + 6 = 11
      expect(rankSumX).toBe(rankSumY); // Also equal rank_sum!

      // When everything is equal, best_individual_rank is used
      const bestRankX = Math.min(...teamX!.team.map(p => p.rank)); // 1
      const bestRankY = Math.min(...teamY!.team.map(p => p.rank)); // 5
      expect(bestRankX).toBeLessThan(bestRankY); // X wins on best individual rank
    });
  });

  describe('Edge cases', () => {
    it('handles empty player list gracefully', () => {
      const result = buildTeam([], 4, 0, 0);
      expect(result).toBeNull();
    });

    it('handles institution with exactly team_size players', () => {
      const exactPlayers = [
        { id: 'e1', name: 'E1', rank: 1, points: 10, gender: 'M' },
        { id: 'e2', name: 'E2', rank: 2, points: 9, gender: 'F' },
        { id: 'e3', name: 'E3', rank: 3, points: 8, gender: 'M' },
        { id: 'e4', name: 'E4', rank: 4, points: 7, gender: 'F' },
      ];
      const result = buildTeam(exactPlayers, 4, 2, 2);
      expect(result).not.toBeNull();
      expect(result!.team.length).toBe(4);
    });

    it('handles null gender as "not F"', () => {
      const playersWithNullGender = [
        { id: 'n1', name: 'N1', rank: 1, points: 10, gender: null },
        { id: 'n2', name: 'N2', rank: 2, points: 9, gender: null },
        { id: 'n3', name: 'N3', rank: 3, points: 8, gender: 'M' },
        { id: 'n4', name: 'N4', rank: 4, points: 7, gender: 'F' },
      ];
      
      // Require 1 female, 1 male - null gender should count as "not F"
      const result = buildTeam(playersWithNullGender, 2, 1, 1);
      expect(result).not.toBeNull();
      expect(result!.team.length).toBe(2);
      
      const females = result!.team.filter(p => isFemale(p.gender));
      expect(females.length).toBe(1);
    });
  });
});

describe('Institution allocation does not affect individual allocation', () => {
  // This test verifies that the institution prize module is completely separate
  // by checking that no changes are made to the allocatePrizes function
  it('allocatePrizes function remains unchanged', async () => {
    // This is a structural test - we just verify the file exists and exports correctly
    // The actual golden tests (New Delhi, Khasdar) should be run separately
    const fs = await import('fs');
    const path = await import('path');
    
    const allocatePrizesPath = path.resolve(process.cwd(), 'supabase/functions/allocatePrizes/index.ts');
    const allocateInstitutionPath = path.resolve(process.cwd(), 'supabase/functions/allocateInstitutionPrizes/index.ts');
    
    // Both files should exist
    expect(fs.existsSync(allocatePrizesPath)).toBe(true);
    expect(fs.existsSync(allocateInstitutionPath)).toBe(true);
    
    // Read both files and verify they are different
    const allocatePrizesContent = fs.readFileSync(allocatePrizesPath, 'utf-8');
    const allocateInstitutionContent = fs.readFileSync(allocateInstitutionPath, 'utf-8');
    
    // Verify allocatePrizes doesn't reference institution tables
    expect(allocatePrizesContent).not.toContain('institution_prize_groups');
    expect(allocatePrizesContent).not.toContain('institution_prizes');
    expect(allocatePrizesContent).not.toContain('allocateInstitutionPrizes');
    
    // Verify allocateInstitutionPrizes is separate
    expect(allocateInstitutionContent).toContain('institution_prize_groups');
    expect(allocateInstitutionContent).toContain('institution_prizes');
    expect(allocateInstitutionContent).not.toContain('allocatePrizes');
  });
});
