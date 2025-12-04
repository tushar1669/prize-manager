import { beforeAll, describe, expect, it, vi } from 'vitest';
import { inferGenderForRow, type GenderColumnConfig } from '@/utils/genderInference';

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
