import { describe, it, expect } from 'vitest';
import { sanitizeDobForImport } from './importSchema';

describe('sanitizeDobForImport', () => {
  it('converts year-only DOBs to January 1', () => {
    expect(sanitizeDobForImport('1996/00/00')).toMatchObject({
      dob: '1996-01-01',
      wasImputedFromYear: true
    });
    expect(sanitizeDobForImport('1996-00-00')).toMatchObject({
      dob: '1996-01-01',
      wasImputedFromYear: true
    });
  });

  it('normalizes valid full dates', () => {
    expect(sanitizeDobForImport('1996/12/31')).toMatchObject({
      dob: '1996-12-31',
      wasImputedFromYear: false
    });
  });

  it('nulls invalid dates', () => {
    expect(sanitizeDobForImport('1996/13/31')).toMatchObject({
      dob: null,
      wasImputedFromYear: false
    });
  });
});
