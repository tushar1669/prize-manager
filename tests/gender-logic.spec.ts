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
  (globalThis as unknown).Deno = { serve: vi.fn(), env: { get: vi.fn() } };
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

  it('detects headerless gender column even when F values appear late in the list (Jaipur-style)', () => {
    // Simulate a 100-row tournament where the only female appears at row 50
    const headers = ['Rank', 'SNo.', '__EMPTY_COL_2', 'Name', 'Name', '__EMPTY_COL_5', 'Rtg'];
    const rows: Record<string, string>[] = [];
    
    // First 49 rows: all blanks in the headerless column
    for (let i = 1; i <= 49; i++) {
      rows.push({
        Rank: String(i),
        'SNo.': String(i),
        __EMPTY_COL_2: '',
        Name: `Player ${i}`,
        __EMPTY_COL_5: '',  // blank - no gender marker
        Rtg: String(1500 + i),
      });
    }
    
    // Row 50: female player with F in headerless column
    rows.push({
      Rank: '50',
      'SNo.': '50',
      __EMPTY_COL_2: '',
      Name: 'Female Player',
      __EMPTY_COL_5: 'F',  // FEMALE marker
      Rtg: '1600',
    });
    
    // Rows 51-100: more blank gender values
    for (let i = 51; i <= 100; i++) {
      rows.push({
        Rank: String(i),
        'SNo.': String(i),
        __EMPTY_COL_2: '',
        Name: `Player ${i}`,
        __EMPTY_COL_5: '',
        Rtg: String(1400 + i),
      });
    }
    
    // The detection should now scan up to 500 rows and find the single F at row 50
    const result = findHeaderlessGenderColumn(headers, rows);
    expect(result).toBe('__EMPTY_COL_5');
  });

  it('detects headerless gender column with only 1 female marker in large dataset', () => {
    const headers = ['Name', '__EMPTY_COL_1', 'Rtg'];
    const rows: Record<string, string>[] = [];
    
    // 99 blank rows
    for (let i = 0; i < 99; i++) {
      rows.push({ Name: `Player ${i}`, __EMPTY_COL_1: '', Rtg: '1500' });
    }
    
    // 1 female at the end
    rows.push({ Name: 'Female Player', __EMPTY_COL_1: 'F', Rtg: '1600' });
    
    const result = findHeaderlessGenderColumn(headers, rows);
    // With the new logic (matches > 0 is sufficient), this should be detected
    expect(result).toBe('__EMPTY_COL_1');
  });

  describe('Swiss-Manager Name-Rtg gap detection', () => {
    it('detects headerless column AFTER second Name column (Swiss-Manager pattern)', () => {
      // Swiss-Manager structure: Rank | SNo | Title | Name | Name | [F/blank] | Rtg
      const headers = ['Rank', 'SNo', 'Title', 'Name', 'Name', '__EMPTY_COL_5', 'Rtg', 'NRtg', 'Fed'];
      const rows = [
        { Rank: '1', SNo: '1', Title: '', Name: 'Player A', __EMPTY_COL_5: '', Rtg: '1800', NRtg: '1750', Fed: 'IND' },
        { Rank: '2', SNo: '2', Title: 'FM', Name: 'Player B', __EMPTY_COL_5: '', Rtg: '2200', NRtg: '2100', Fed: 'IND' },
        { Rank: '3', SNo: '3', Title: '', Name: 'Female Player', __EMPTY_COL_5: 'F', Rtg: '1600', NRtg: '1550', Fed: 'IND' },
        { Rank: '4', SNo: '4', Title: '', Name: 'Player D', __EMPTY_COL_5: '', Rtg: '1500', NRtg: '1450', Fed: 'IND' },
      ];
      
      const result = findHeaderlessGenderColumn(headers, rows);
      expect(result).toBe('__EMPTY_COL_5');
    });

    it('finds headerless gender column in Jaipur-style structure', () => {
      // Actual Jaipur structure: Rank | SNo | [empty] | Name | Name | [F/blank] | Rtg | ...
      const headers = ['Rank', 'SNo.', '__EMPTY_COL_2', 'Name', 'Name', '__EMPTY_COL_5', 'Rtg', 'NRtg', 'IRtg'];
      const rows: Record<string, string>[] = [];
      
      // 50 male players (blank in gender column)
      for (let i = 1; i <= 50; i++) {
        rows.push({
          Rank: String(i),
          'SNo.': String(i),
          __EMPTY_COL_2: '',
          Name: `Player ${i}`,
          __EMPTY_COL_5: '',
          Rtg: String(1500 + i * 10),
          NRtg: String(1500 + i * 10),
          IRtg: String(1500 + i * 10),
        });
      }
      
      // 3 female players with F marker
      rows[10].__EMPTY_COL_5 = 'F';
      rows[25].__EMPTY_COL_5 = 'F';
      rows[40].__EMPTY_COL_5 = 'F';
      
      const result = findHeaderlessGenderColumn(headers, rows);
      expect(result).toBe('__EMPTY_COL_5');
    });

    it('does NOT mistake first Name column position for gender', () => {
      // Ensure we look AFTER the LAST Name column, not the first
      const headers = ['Rank', 'Name', 'Name', '__EMPTY_COL_3', 'Rtg'];
      const rows = [
        { Rank: '1', Name: 'Player A Full Name', __EMPTY_COL_3: 'F', Rtg: '1500' },
        { Rank: '2', Name: 'Player B Full Name', __EMPTY_COL_3: '', Rtg: '1600' },
      ];
      
      const result = findHeaderlessGenderColumn(headers, rows);
      // Should find __EMPTY_COL_3 which is AFTER the second Name column
      expect(result).toBe('__EMPTY_COL_3');
    });

    it('handles empty region between Name and Rtg with no headerless columns', () => {
      const headers = ['Rank', 'Name', 'Name', 'Federation', 'Rtg'];
      const rows = [
        { Rank: '1', Name: 'Player A', Federation: 'IND', Rtg: '1500' },
      ];
      
      const result = findHeaderlessGenderColumn(headers, rows);
      // No headerless columns in the gap, should return null
      expect(result).toBeNull();
    });

    it('prefers column with more gender matches when multiple headerless columns exist', () => {
      const headers = ['Rank', 'Name', 'Name', '__EMPTY_COL_3', '__EMPTY_COL_4', 'Rtg'];
      const rows = [
        { Rank: '1', Name: 'P1', __EMPTY_COL_3: '', __EMPTY_COL_4: 'F', Rtg: '1500' },
        { Rank: '2', Name: 'P2', __EMPTY_COL_3: '', __EMPTY_COL_4: 'F', Rtg: '1600' },
        { Rank: '3', Name: 'P3', __EMPTY_COL_3: '', __EMPTY_COL_4: '', Rtg: '1700' },
        { Rank: '4', Name: 'P4', __EMPTY_COL_3: 'M', __EMPTY_COL_4: 'F', Rtg: '1800' },
      ];
      
      const result = findHeaderlessGenderColumn(headers, rows);
      // __EMPTY_COL_4 has 3 F values, __EMPTY_COL_3 has 1 M value
      expect(result).toBe('__EMPTY_COL_4');
    });
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
  const baseCat = { id: 'cat', name: 'Category', is_main: false, order_idx: 0 } as unknown;
  const rules = { strict_age: true, allow_missing_dob_for_age: true, max_age_inclusive: true } as unknown;
  const date = new Date('2024-01-01');

  it('female-only categories reject null or male genders', () => {
    const catF = { ...baseCat, criteria_json: { gender: 'F' } } as unknown;
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
    const catM = { ...baseCat, criteria_json: { gender: 'M' } } as unknown;
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

describe('Real tournament file integration tests', () => {
  /**
   * These tests verify the Name-Rtg gap gender detection works on real Swiss-Manager files
   * from actual tournaments. The files have:
   * - Two "Name" columns (full name + abbreviated name)
   * - Headerless F/blank column AFTER the second Name column
   * - The F marker in that column indicates female players
   */

  it('detects headerless gender column in Swiss-Manager structure with two Name columns', () => {
    // Simulating the exact structure from Jaipur/Shahdol tournaments
    const headers = ['Rank', 'SNo.', '__EMPTY_COL_2', 'Name', 'Name', '__EMPTY_COL_5', 'Rtg', 'NRtg', 'IRtg', 'Fed', 'FS', 'Type', 'Gr'];
    const rows: Record<string, string>[] = [];
    
    // 100 players, with 3 females marked with 'F' in the headerless column
    for (let i = 1; i <= 100; i++) {
      rows.push({
        Rank: String(i),
        'SNo.': String(i),
        __EMPTY_COL_2: '',
        Name: `Player ${i}`,
        __EMPTY_COL_5: '',  // Most are blank (unknown/male)
        Rtg: String(1500 + i),
        NRtg: String(1500 + i),
        IRtg: String(1500 + i),
        Fed: 'IND',
        FS: '',
        Type: 'U13',
        Gr: '',
      });
    }
    
    // Mark 3 females in the headerless column
    rows[10].__EMPTY_COL_5 = 'F';  // Player 11
    rows[38].__EMPTY_COL_5 = 'F';  // Player 39 (like Pal Vedika in Jaipur)
    rows[75].__EMPTY_COL_5 = 'F';  // Player 76
    
    const result = findHeaderlessGenderColumn(headers, rows);
    expect(result).toBe('__EMPTY_COL_5');
    
    // Verify gender inference for the female rows
    const config: GenderColumnConfig = {
      genderColumn: null,
      fsColumn: 'FS',
      headerlessGenderColumn: '__EMPTY_COL_5',
      preferredColumn: '__EMPTY_COL_5',
      preferredSource: 'headerless_after_name',
    };
    
    // Female player (has F in headerless column)
    const femaleRow = { ...rows[38], Name: 'Pal Vedika' };
    const femaleInference = inferGenderForRow(femaleRow, config);
    expect(femaleInference.gender).toBe('F');
    expect(femaleInference.sources).toContain('headerless_after_name');
    
    // Male/unknown player (blank in headerless column)
    const maleRow = { ...rows[0], Name: 'Male Player' };
    const maleInference = inferGenderForRow(maleRow, config);
    expect(maleInference.gender).toBeNull();  // Blank = unknown, not male
  });

  it('counts correct number of females from headerless F column', () => {
    const headers = ['Rank', 'Name', 'Name', '__EMPTY_COL_3', 'Rtg'];
    const rows: Record<string, string>[] = [];
    
    // Create 50 players, 5 female
    for (let i = 1; i <= 50; i++) {
      rows.push({
        Rank: String(i),
        Name: `Player ${i}`,
        __EMPTY_COL_3: i % 10 === 0 ? 'F' : '',  // Every 10th player is female
        Rtg: String(1500 + i),
      });
    }
    
    const headerlessCol = findHeaderlessGenderColumn(headers, rows);
    expect(headerlessCol).toBe('__EMPTY_COL_3');
    
    // Count females using gender inference
    const config: GenderColumnConfig = {
      genderColumn: null,
      fsColumn: null,
      headerlessGenderColumn: headerlessCol,
      preferredColumn: headerlessCol,
      preferredSource: 'headerless_after_name',
    };
    
    let femaleCount = 0;
    for (const row of rows) {
      const inference = inferGenderForRow(row, config);
      if (inference.gender === 'F') femaleCount++;
    }
    
    expect(femaleCount).toBe(5);  // Rows 10, 20, 30, 40, 50
  });
});
