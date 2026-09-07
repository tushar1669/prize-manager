import { describe, expect, it } from 'vitest';

import {
  formatExclusionSentence,
  formatTeamRuleClause,
} from '@/components/allocation/TeamPrizeResultsPanel';

/**
 * TC1.5. The formatter is the single place the team composition rule turns into
 * words, so RULING 2 is enforceable in one file: output states the RULE THAT WAS
 * APPLIED and never asserts a count of players' attributes.
 */
describe('formatTeamRuleClause', () => {
  describe('both slots zero — the live configuration', () => {
    // All three live prize groups sit at female_slots = 0, male_slots = 0. No rule
    // was applied, so there is nothing to state: null, and every caller renders
    // nothing at all — not "0 girls", not an empty badge.
    it('returns null so no rule text is rendered', () => {
      expect(formatTeamRuleClause({ female_slots: 0, male_slots: 0 })).toBeNull();
      expect(formatTeamRuleClause({ female_slots: 0, male_slots: 0 }, 'compact')).toBeNull();
    });

    it('returns null for negative or non-numeric slot values', () => {
      expect(formatTeamRuleClause({ female_slots: -1, male_slots: -3 })).toBeNull();
      expect(
        formatTeamRuleClause({ female_slots: NaN, male_slots: undefined as unknown as number })
      ).toBeNull();
    });
  });

  describe('sentence style — results panel and PDF', () => {
    it('states a girls minimum', () => {
      expect(formatTeamRuleClause({ female_slots: 2, male_slots: 0 })).toBe('at least 2 girls');
    });

    it('adds the other-players clause only when male_slots > 0', () => {
      expect(formatTeamRuleClause({ female_slots: 2, male_slots: 2 })).toBe(
        'at least 2 girls, 2 other players'
      );
    });

    it('leads with the minimum when only other players are required', () => {
      expect(formatTeamRuleClause({ female_slots: 0, male_slots: 3 })).toBe(
        'at least 3 other players'
      );
    });

    it('singularises a minimum of one', () => {
      expect(formatTeamRuleClause({ female_slots: 1, male_slots: 1 })).toBe(
        'at least 1 girl, 1 other player'
      );
    });
  });

  describe('compact style — editor badge', () => {
    it('renders the girls minimum as a badge', () => {
      expect(formatTeamRuleClause({ female_slots: 2, male_slots: 0 }, 'compact')).toBe('min 2 girls');
    });

    it('marks both clauses as minimums, since neither is a quota', () => {
      expect(formatTeamRuleClause({ female_slots: 2, male_slots: 2 }, 'compact')).toBe(
        'min 2 girls, min 2 other players'
      );
    });
  });

  describe('RULING 1 and RULING 2 wording constraints', () => {
    const configs = [
      { female_slots: 2, male_slots: 2 },
      { female_slots: 2, male_slots: 0 },
      { female_slots: 0, male_slots: 2 },
      { female_slots: 1, male_slots: 4 },
    ];

    it('never says "male" or "boys" — male_slots means "not F", including unrecorded', () => {
      for (const config of configs) {
        for (const style of ['sentence', 'compact'] as const) {
          const clause = formatTeamRuleClause(config, style)!;
          expect(clause).not.toMatch(/male|boy/i);
          if (config.male_slots > 0) expect(clause).toContain('other player');
        }
      }
    });

    it('never emits the forbidden quota shorthand', () => {
      for (const config of configs) {
        for (const style of ['sentence', 'compact'] as const) {
          const clause = formatTeamRuleClause(config, style)!;
          // "2F + 2M required" and "Team: 2F + 2M" are the two forms RULING 2 names.
          expect(clause).not.toMatch(/\d\s*F\b/);
          expect(clause).not.toMatch(/\d\s*M\b/);
          expect(clause).not.toMatch(/required|exactly/i);
        }
      }
    });

    it('always marks the requirement as a minimum, never as an exact composition', () => {
      for (const config of configs) {
        expect(formatTeamRuleClause(config, 'sentence')).toMatch(/^at least /);
        expect(formatTeamRuleClause(config, 'compact')).toMatch(/^min /);
      }
    });
  });
});

/**
 * ARCHITECTURE §4 rendering rule: every code renders as a plain sentence in
 * organizer-facing UI, never as a raw code.
 */
describe('formatExclusionSentence', () => {
  it('maps every shipped fail code to its §4 sentence', () => {
    expect(formatExclusionSentence('team_short_roster')).toBe('Fewer players than the team size.');
    expect(formatExclusionSentence('female_slots_unfilled')).toBe(
      'The rule asks for a minimum number of girls and the entry list does not meet it.'
    );
    expect(formatExclusionSentence('male_slots_unfilled')).toBe(
      'The rule asks for other players and the entry list does not meet it.'
    );
  });

  it('never leaks a raw code, including one added upstream without a sentence here', () => {
    // below_minimum_roster arrives with TC1.6 and has no sentence in this table yet.
    for (const code of ['below_minimum_roster', 'team_short_roster', '', 'not_a_code']) {
      expect(formatExclusionSentence(code)).not.toContain('_');
      expect(formatExclusionSentence(code)).toMatch(/\.$/);
    }
  });

  it('states the rule that was asked for, never what a roster contains', () => {
    for (const code of ['team_short_roster', 'female_slots_unfilled', 'male_slots_unfilled']) {
      expect(formatExclusionSentence(code)).not.toMatch(/\bhas\b|\bonly \d|\d girls?\b/i);
    }
  });
});
