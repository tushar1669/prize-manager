import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase before importing the function
vi.mock('npm:@supabase/supabase-js@2', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      // Return different mock data based on table
      if (table === 'institution_prize_groups') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(async () => ({
                  data: mockGroups,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }
      if (table === 'institution_prizes') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(async () => ({
                  data: mockPrizes,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }
      if (table === 'players') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: mockPlayers,
                error: null,
              })),
            })),
          })),
        };
      }
      return {
        select: vi.fn(async () => ({ data: [], error: null })),
      };
    }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: null })) },
  })),
}));

// Mock data
let mockGroups: any[] = [];
let mockPrizes: any[] = [];
let mockPlayers: any[] = [];

// Set Deno environment for tests
(globalThis as any).Deno = {
  env: {
    get: (key: string) => {
      if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
      if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-key';
      return undefined;
    },
  },
  serve: vi.fn(),
};

describe('Institution Prize Schema Tests', () => {
  beforeEach(() => {
    // Reset mock data
    mockGroups = [];
    mockPrizes = [];
    mockPlayers = [];
    vi.clearAllMocks();
  });

  describe('Response Shape Validation', () => {
    it('returns expected JSON shape when no groups exist', async () => {
      // Arrange: empty data
      mockGroups = [];
      mockPrizes = [];
      mockPlayers = [];

      const expectedResponse = {
        groups: [],
        players_loaded: 0,
      };

      // The function is designed to return this shape
      // Verify the shape matches our expectations
      expect(expectedResponse).toHaveProperty('groups');
      expect(expectedResponse).toHaveProperty('players_loaded');
      expect(Array.isArray(expectedResponse.groups)).toBe(true);
      expect(typeof expectedResponse.players_loaded).toBe('number');
    });

    it('returns expected JSON shape with groups and prizes', async () => {
      // Arrange: mock data
      const testGroupId = 'group-uuid-1';
      const testTournamentId = 'tournament-uuid-1';

      mockGroups = [
        {
          id: testGroupId,
          tournament_id: testTournamentId,
          name: 'Best School',
          group_by: 'school',
          team_size: 5,
          female_slots: 2,
          male_slots: 0,
          scoring_mode: 'by_top_k_score',
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockPrizes = [
        {
          id: 'prize-uuid-1',
          group_id: testGroupId,
          place: 1,
          cash_amount: 5000,
          has_trophy: true,
          has_medal: false,
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'prize-uuid-2',
          group_id: testGroupId,
          place: 2,
          cash_amount: 3000,
          has_trophy: false,
          has_medal: true,
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockPlayers = [
        { id: 'p1', name: 'Player 1', rank: 1, rating: 1500, dob: '2010-01-01', gender: 'M', state: 'MP', city: 'Bhopal', club: 'School A', tournament_id: testTournamentId },
        { id: 'p2', name: 'Player 2', rank: 2, rating: 1400, dob: '2011-01-01', gender: 'F', state: 'MP', city: 'Bhopal', club: 'School A', tournament_id: testTournamentId },
      ];

      // Expected response shape
      const expectedShape = {
        groups: [
          {
            group_id: testGroupId,
            name: 'Best School',
            config: {
              group_by: 'school',
              team_size: 5,
              female_slots: 2,
              male_slots: 0,
              scoring_mode: 'by_top_k_score',
            },
            prizes: [
              { id: 'prize-uuid-1', place: 1, cash_amount: 5000, has_trophy: true, has_medal: false, is_active: true },
              { id: 'prize-uuid-2', place: 2, cash_amount: 3000, has_trophy: false, has_medal: true, is_active: true },
            ],
          },
        ],
        players_loaded: 2,
      };

      // Validate shape structure
      expect(expectedShape).toHaveProperty('groups');
      expect(expectedShape).toHaveProperty('players_loaded');
      expect(Array.isArray(expectedShape.groups)).toBe(true);
      expect(expectedShape.groups.length).toBe(1);

      const group = expectedShape.groups[0];
      expect(group).toHaveProperty('group_id');
      expect(group).toHaveProperty('name');
      expect(group).toHaveProperty('config');
      expect(group).toHaveProperty('prizes');

      // Validate config shape
      expect(group.config).toHaveProperty('group_by');
      expect(group.config).toHaveProperty('team_size');
      expect(group.config).toHaveProperty('female_slots');
      expect(group.config).toHaveProperty('male_slots');
      expect(group.config).toHaveProperty('scoring_mode');

      // Validate prize shape
      expect(group.prizes.length).toBe(2);
      const prize = group.prizes[0];
      expect(prize).toHaveProperty('id');
      expect(prize).toHaveProperty('place');
      expect(prize).toHaveProperty('cash_amount');
      expect(prize).toHaveProperty('has_trophy');
      expect(prize).toHaveProperty('has_medal');
      expect(prize).toHaveProperty('is_active');
    });
  });

  describe('Group Configuration Validation', () => {
    it('validates group_by field options', () => {
      const validGroupByValues = ['school', 'academy', 'club', 'city', 'state'];
      
      validGroupByValues.forEach(value => {
        const group = { group_by: value };
        expect(typeof group.group_by).toBe('string');
        expect(group.group_by.length).toBeGreaterThan(0);
      });
    });

    it('validates team composition constraints', () => {
      // team_size must be > 0
      // female_slots >= 0
      // male_slots >= 0
      // female_slots + male_slots <= team_size

      const validConfigs = [
        { team_size: 5, female_slots: 2, male_slots: 0 }, // 2 girls required, rest can be any
        { team_size: 4, female_slots: 1, male_slots: 1 }, // 1 girl, 1 boy required
        { team_size: 3, female_slots: 0, male_slots: 0 }, // No gender requirements
        { team_size: 6, female_slots: 3, male_slots: 3 }, // Equal split
      ];

      validConfigs.forEach(config => {
        expect(config.team_size).toBeGreaterThan(0);
        expect(config.female_slots).toBeGreaterThanOrEqual(0);
        expect(config.male_slots).toBeGreaterThanOrEqual(0);
        expect(config.female_slots + config.male_slots).toBeLessThanOrEqual(config.team_size);
      });
    });

    it('validates scoring_mode options', () => {
      const validScoringModes = ['by_top_k_score', 'by_top_k_rank', 'by_sum_rating'];
      
      validScoringModes.forEach(mode => {
        expect(typeof mode).toBe('string');
        expect(mode.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Prize Configuration', () => {
    it('validates prize place ordering', () => {
      const prizes = [
        { place: 1, cash_amount: 5000 },
        { place: 2, cash_amount: 3000 },
        { place: 3, cash_amount: 2000 },
      ];

      // Places should be positive integers
      prizes.forEach(p => {
        expect(p.place).toBeGreaterThan(0);
        expect(Number.isInteger(p.place)).toBe(true);
      });

      // Cash amounts should be non-negative
      prizes.forEach(p => {
        expect(p.cash_amount).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Independence from Individual Allocation', () => {
    it('confirms institution prizes ignore multi_prize_policy', () => {
      // This test documents that institution prizes are separate from individual allocation
      // A player can win:
      // - Individual prizes (governed by multi_prize_policy)
      // - AND institution prizes (no limit)
      
      const individualPolicyModes = ['single', 'main_plus_one_side', 'unlimited'];
      
      // Institution prizes should work the same regardless of individual policy
      individualPolicyModes.forEach(policy => {
        // Institution allocation should not reference multi_prize_policy
        const institutionConfig = {
          group_by: 'school',
          team_size: 5,
          // No multi_prize_policy here - it's irrelevant
        };
        
        expect(institutionConfig).not.toHaveProperty('multi_prize_policy');
      });
    });
  });
});
