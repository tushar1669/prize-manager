import { beforeAll, describe, expect, it, vi } from 'vitest';
import { inferGenderForRow, type GenderColumnConfig } from '@/utils/genderInference';
import { findHeaderlessGenderColumn } from '@/utils/importSchema';

const baseConfig: GenderColumnConfig = {
  genderColumn: 'gender',
  fsColumn: 'fs',
  headerlessGenderColumn: null,
  preferredColumn: 'gender',
  preferredSource: 'gender_column',
};

let evaluateEligibility: typeof import('../supabase/functions/allocatePrizes/index').evaluateEligibility;

beforeAll(async () => {
  (globalThis as any).Deno = { serve: vi.fn(), env: { get: vi.fn() } };
  const allocator = await import('../supabase/functions/allocatePrizes/index');
  evaluateEligibility = allocator.evaluateEligibility;
});

describe('gender inference', () => {
  it('treats FS column with F as female only', () => {
    const inference = inferGenderForRow({ fs: 'F' }, baseConfig);
    expect(inference.gender).toBe('F');
    expect(inference.sources).toContain('fs_column');
    expect(inference.gender_source).toBe('fs_column');
  });

  it('treats headerless gender column with F as female only', () => {
    const inference = inferGenderForRow({ hidden: 'F' }, { ...baseConfig, headerlessGenderColumn: 'hidden' });
    expect(inference.gender).toBe('F');
    expect(inference.sources).toContain('headerless_after_name');
    expect(inference.gender_source).toBe('headerless_after_name');
  });

  it('sets female when Type/Group carries FMG marker', () => {
    const inference = inferGenderForRow({}, baseConfig, 'FMG', null);
    expect(inference.gender).toBe('F');
    expect(inference.sources).toContain('type_label');
    expect(inference.female_signal_source).toBe('FMG');
  });

  it('prefers explicit female gender even when FS is blank', () => {
    const inference = inferGenderForRow({ gender: 'Female', fs: '' }, baseConfig);
    expect(inference.gender).toBe('F');
    expect(inference.sources).toContain('gender_column');
  });

  it('overrides male gender when Type includes FMG and records warning', () => {
    const inference = inferGenderForRow({ gender: 'M' }, baseConfig, 'FMG', null);
    expect(inference.gender).toBe('F');
    expect(inference.warnings).toContain('female signal overrides explicit male gender');
    expect(inference.sources).toContain('type_label');
    expect(inference.gender_source).toBe('type_label');
  });

  it('leaves blank gender values as null', () => {
    const inference = inferGenderForRow({}, baseConfig);
    expect(inference.gender).toBeNull();
  });

  // New tests for extended gender inference

  it('recognizes GIRLS as explicit female', () => {
    const inference = inferGenderForRow({ gender: 'GIRLS' }, baseConfig);
    expect(inference.gender).toBe('F');
    expect(inference.sources).toContain('gender_column');
  });

  it('recognizes BOYS as explicit male', () => {
    const inference = inferGenderForRow({ gender: 'BOYS' }, baseConfig);
    expect(inference.gender).toBe('M');
    expect(inference.sources).toContain('gender_column');
  });

  it('treats FS column with G as female', () => {
    const inference = inferGenderForRow({ fs: 'G' }, baseConfig);
    expect(inference.gender).toBe('F');
    expect(inference.sources).toContain('fs_column');
    expect(inference.female_signal_source).toBe('FS_SIGNAL');
  });

  it('treats FS column with W as female', () => {
    const inference = inferGenderForRow({ fs: 'W' }, baseConfig);
    expect(inference.gender).toBe('F');
    expect(inference.sources).toContain('fs_column');
    expect(inference.female_signal_source).toBe('FS_SIGNAL');
  });

  it('treats FS column with WFM as female (title prefix)', () => {
    const inference = inferGenderForRow({ fs: 'WFM' }, baseConfig);
    expect(inference.gender).toBe('F');
    expect(inference.sources).toContain('fs_column');
    expect(inference.female_signal_source).toBe('TITLE');
  });

  it('treats FS column with WIM as female (title prefix)', () => {
    const inference = inferGenderForRow({ fs: 'WIM' }, baseConfig);
    expect(inference.gender).toBe('F');
    expect(inference.female_signal_source).toBe('TITLE');
  });

  it('treats FS column with WGM as female (title prefix)', () => {
    const inference = inferGenderForRow({ fs: 'WGM' }, baseConfig);
    expect(inference.gender).toBe('F');
    expect(inference.female_signal_source).toBe('TITLE');
  });

  it('does NOT treat FM as female (non-gender title)', () => {
    const inference = inferGenderForRow({ fs: 'FM' }, baseConfig);
    expect(inference.gender).toBeNull();
  });

  it('does NOT treat IM as female (non-gender title)', () => {
    const inference = inferGenderForRow({ fs: 'IM' }, baseConfig);
    expect(inference.gender).toBeNull();
  });

  it('does NOT treat GM as female (non-gender title)', () => {
    const inference = inferGenderForRow({ fs: 'GM' }, baseConfig);
    expect(inference.gender).toBeNull();
  });

  it('does NOT treat AGM as female (non-gender title)', () => {
    const inference = inferGenderForRow({ fs: 'AGM' }, baseConfig);
    expect(inference.gender).toBeNull();
  });

  it('sets female when Type contains F13 pattern', () => {
    const inference = inferGenderForRow({}, baseConfig, 'F13', null);
    expect(inference.gender).toBe('F');
    expect(inference.sources).toContain('type_label');
    expect(inference.female_signal_source).toBe('F_PREFIX');
  });

  it('sets female when Type contains F9 pattern', () => {
    const inference = inferGenderForRow({}, baseConfig, 'F9', null);
    expect(inference.gender).toBe('F');
    expect(inference.female_signal_source).toBe('F_PREFIX');
  });

  it('sets female when Type/Group contains GIRL token', () => {
    const inference = inferGenderForRow({}, baseConfig, 'GIRL', null);
    expect(inference.gender).toBe('F');
    expect(inference.female_signal_source).toBe('GIRL_TOKEN');
  });

  it('sets female when Type/Group contains GIRLS token', () => {
    const inference = inferGenderForRow({}, baseConfig, null, 'GIRLS');
    expect(inference.gender).toBe('F');
    expect(inference.sources).toContain('group_label');
    expect(inference.female_signal_source).toBe('GIRL_TOKEN');
  });

  it('sets female when Group contains FMG marker', () => {
    const inference = inferGenderForRow({}, baseConfig, null, 'FMG');
    expect(inference.gender).toBe('F');
    expect(inference.sources).toContain('group_label');
    expect(inference.female_signal_source).toBe('FMG');
  });

  it('headerless M value results in null gender (female-only column)', () => {
    const inference = inferGenderForRow({ hidden: 'M' }, { ...baseConfig, headerlessGenderColumn: 'hidden' });
    // FS/headerless columns are female-only signals; M means unknown, not male
    expect(inference.gender).toBeNull();
  });

  it('FS column blank results in null gender', () => {
    const inference = inferGenderForRow({ fs: '' }, baseConfig);
    expect(inference.gender).toBeNull();
  });
});

describe('headerless gender column detection', () => {
  it('detects column with single-letter F/M values as gender', () => {
    const headers = ['Name', '__EMPTY_COL_1', 'Rtg'];
    const rows = [
      { Name: 'Player A', __EMPTY_COL_1: 'F', Rtg: '1500' },
      { Name: 'Player B', __EMPTY_COL_1: 'M', Rtg: '1600' },
      { Name: 'Player C', __EMPTY_COL_1: 'F', Rtg: '1400' },
      { Name: 'Player D', __EMPTY_COL_1: 'M', Rtg: '1550' },
    ];
    
    const result = findHeaderlessGenderColumn(headers, rows);
    expect(result).toBe('__EMPTY_COL_1');
  });

  it('does NOT detect short name column as gender (K. Arun pattern)', () => {
    const headers = ['Name', '__EMPTY_COL_1', 'Rtg'];
    const rows = [
      { Name: 'Arun Kumar', __EMPTY_COL_1: 'K. Arun', Rtg: '1500' },
      { Name: 'Sangma Roy', __EMPTY_COL_1: 'R. Sangma', Rtg: '1600' },
      { Name: 'Priya Singh', __EMPTY_COL_1: 'P. Singh', Rtg: '1400' },
      { Name: 'Vikram Patel', __EMPTY_COL_1: 'V. Patel', Rtg: '1550' },
    ];
    
    const result = findHeaderlessGenderColumn(headers, rows);
    expect(result).toBeNull();
  });

  it('does NOT detect title column as gender (FM, IM pattern)', () => {
    const headers = ['Name', '__EMPTY_COL_1', 'Rtg'];
    const rows = [
      { Name: 'Player A', __EMPTY_COL_1: 'FM', Rtg: '2200' },
      { Name: 'Player B', __EMPTY_COL_1: 'IM', Rtg: '2400' },
      { Name: 'Player C', __EMPTY_COL_1: 'GM', Rtg: '2600' },
      { Name: 'Player D', __EMPTY_COL_1: '', Rtg: '1800' },
    ];
    
    const result = findHeaderlessGenderColumn(headers, rows);
    expect(result).toBeNull();
  });

  it('detects column with B/G values as gender', () => {
    const headers = ['Name', '__EMPTY_COL_1', 'Rtg'];
    const rows = [
      { Name: 'Player A', __EMPTY_COL_1: 'B', Rtg: '1500' },
      { Name: 'Player B', __EMPTY_COL_1: 'G', Rtg: '1600' },
      { Name: 'Player C', __EMPTY_COL_1: 'B', Rtg: '1400' },
    ];
    
    const result = findHeaderlessGenderColumn(headers, rows);
    expect(result).toBe('__EMPTY_COL_1');
  });
});

describe('Jaipur-style tournament simulation', () => {
  // Simulates a tournament like "Second Jaipur Open" with FS, Type, Group columns
  
  it('detects female from FMG in group_label', () => {
    const config: GenderColumnConfig = {
      genderColumn: null,
      fsColumn: 'FS',
      headerlessGenderColumn: null,
      preferredColumn: 'FS',
      preferredSource: 'fs_column',
    };

    // Player 1: Female (has FMG in Group)
    const player1 = inferGenderForRow(
      { FS: '', Type: 'U13', Group: 'FMG' },
      config,
      'U13',  // type_label
      'FMG'   // group_label
    );
    expect(player1.gender).toBe('F');
    expect(player1.sources).toContain('group_label');
    expect(player1.female_signal_source).toBe('FMG');

    // Player 2: Unknown gender (no female markers)
    const player2 = inferGenderForRow(
      { FS: '', Type: 'U13', Group: '' },
      config,
      'U13',
      ''
    );
    expect(player2.gender).toBeNull();

    // Player 3: Female (has F13 in Type)
    const player3 = inferGenderForRow(
      { FS: '', Type: 'F13', Group: '' },
      config,
      'F13',
      ''
    );
    expect(player3.gender).toBe('F');
    expect(player3.sources).toContain('type_label');
    expect(player3.female_signal_source).toBe('F_PREFIX');
  });

  it('BEST FEMALE category sees candidates when FMG markers present', () => {
    const config: GenderColumnConfig = {
      genderColumn: null,
      fsColumn: 'FS',
      headerlessGenderColumn: null,
      preferredColumn: 'FS',
      preferredSource: 'fs_column',
    };

    // Simulate 5 players, 2 with FMG marker
    const players = [
      { name: 'Player A', rank: 1, FS: '', Type: 'U13', Group: 'FMG' },
      { name: 'Player B', rank: 2, FS: '', Type: 'U11', Group: '' },
      { name: 'Player C', rank: 3, FS: '', Type: 'F13', Group: '' },
      { name: 'Player D', rank: 4, FS: '', Type: 'S60', Group: '' },
      { name: 'Player E', rank: 5, FS: 'F', Type: '', Group: '' },
    ];

    const femalesFound = players.filter(p => {
      const inference = inferGenderForRow(
        p,
        config,
        p.Type,
        p.Group
      );
      return inference.gender === 'F';
    });

    // Should find 3 females: Player A (FMG), Player C (F13), Player E (FS=F)
    expect(femalesFound.length).toBe(3);
    expect(femalesFound.map(p => p.name)).toEqual(['Player A', 'Player C', 'Player E']);
  });
});

describe('gender eligibility', () => {
  const baseCat = { id: 'cat', name: 'Category', is_main: false, order_idx: 0 } as any;
  const rules = { strict_age: true, allow_missing_dob_for_age: true, max_age_inclusive: true } as any;
  const date = new Date('2024-01-01');

  it('female-only categories reject null or male genders', () => {
    const catF = { ...baseCat, criteria_json: { gender: 'F' } } as any;
    const missing = evaluateEligibility({ gender: null }, catF, rules, date);
    expect(missing.eligible).toBe(false);
    expect(missing.reasonCodes).toContain('gender_missing');

    const male = evaluateEligibility({ gender: 'M' }, catF, rules, date);
    expect(male.eligible).toBe(false);
    expect(male.reasonCodes).toContain('gender_mismatch');

    const female = evaluateEligibility({ gender: 'F' }, catF, rules, date);
    expect(female.eligible).toBe(true);
    expect(female.passCodes).toContain('gender_ok');
  });

  it('male categories accept null or male but reject female', () => {
    const catM = { ...baseCat, criteria_json: { gender: 'M' } } as any;
    const unknown = evaluateEligibility({ gender: null }, catM, rules, date);
    expect(unknown.eligible).toBe(true);
    expect(unknown.passCodes).toContain('gender_ok');

    const male = evaluateEligibility({ gender: 'M' }, catM, rules, date);
    expect(male.eligible).toBe(true);
    expect(male.passCodes).toContain('gender_ok');

    const female = evaluateEligibility({ gender: 'F' }, catM, rules, date);
    expect(female.eligible).toBe(false);
    expect(female.reasonCodes).toContain('gender_mismatch');
  });
});
