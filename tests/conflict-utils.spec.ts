import { describe, it, expect } from 'vitest';
import {
  detectConflictsInDraft,
  buildFideKey,
  buildNameDobKey,
  buildSnoKey,
  normName,
  normDob,
} from '../src/utils/conflictUtils';

describe('conflict utils', () => {
  it('normalizes names and dobs', () => {
    expect(normName('  Álvaro   de la   Cruz  ')).toBe('alvaro de la cruz');
    expect(normName('Ed')).toBe('');
    expect(normDob('2024-01-05')).toBe('2024-01-05');
    expect(normDob('Jan 5, 2024')).toBe('2024-01-05');
  });

  it('builds person-centric keys', () => {
    expect(buildFideKey({ fide_id: '  123 456 ' })).toBe('123456');
    expect(buildFideKey({ fide_id: '12345' })).toBe('');
    expect(buildNameDobKey({ name: 'Jane Doe', dob: '2001-02-03' })).toBe('jane doe::2001-02-03');
    expect(buildSnoKey({ sno: ' 42 ' })).toBe('42');
  });

  it('detects FIDE duplicates in draft rows', () => {
    const conflicts = detectConflictsInDraft([
      { name: 'Alice', fide_id: '111222', rank: 1 },
      { name: 'Bob', fide_id: '111222', rank: 2 },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ keyKind: 'fide', reason: 'Same FIDE id' });
  });

  it('detects name+dob duplicates when FIDE is absent', () => {
    const conflicts = detectConflictsInDraft([
      { name: 'Carla López', dob: '2000-07-12', rank: 4 },
      { name: '  carla lopez ', dob: 'July 12 2000', rank: 5 },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ keyKind: 'nameDob', reason: 'Same name+dob' });
  });

  it('ignores rank-only ties', () => {
    const conflicts = detectConflictsInDraft([
      { name: '', rank: 10 },
      { name: null, rank: 10 },
    ]);
    expect(conflicts).toHaveLength(0);
  });

  it('detects duplicate serial numbers', () => {
    const conflicts = detectConflictsInDraft([
      { name: 'Player A', sno: 5, rank: 1 },
      { name: 'Player B', sno: '5', rank: 2 },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ keyKind: 'sno', reason: 'Duplicate SNo' });
  });
});
