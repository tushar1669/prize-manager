import { describe, it, expect } from 'vitest';
import {
  detectConflictsInDraft,
  buildFideKey,
  buildNameDobKey,
  buildSnoKey,
  normName,
  normDob,
  shouldGroupAsNameDobConflict,
  formatConflictReason,
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
    expect(conflicts[0]).toMatchObject({ keyKind: 'fide', reason: 'Same FIDE ID' });
  });

  it('detects name+dob duplicates when FIDE is absent', () => {
    const conflicts = detectConflictsInDraft([
      { name: 'Carla López', dob: '2000-07-12', rank: 4 },
      { name: '  carla lopez ', dob: 'July 12 2000', rank: 5 },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ keyKind: 'nameDob', reason: 'Same name + DOB' });
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
    expect(conflicts[0]).toMatchObject({ keyKind: 'sno', reason: 'Duplicate serial number' });
  });
});

describe('FIDE ID conflict precedence', () => {
  it('does NOT create name+dob conflict when FIDE IDs differ', () => {
    // Two different players with same name+dob but different FIDE IDs
    const conflicts = detectConflictsInDraft([
      { name: 'John Smith', dob: '2010-05-15', fide_id: '123456', rank: 1 },
      { name: 'John Smith', dob: '2010-05-15', fide_id: '789012', rank: 2 },
    ]);
    // Should be zero conflicts - different FIDE IDs mean different players
    expect(conflicts).toHaveLength(0);
  });

  it('creates name+dob conflict when FIDE IDs are the same', () => {
    const conflicts = detectConflictsInDraft([
      { name: 'John Smith', dob: '2010-05-15', fide_id: '123456', rank: 1 },
      { name: 'John Smith', dob: '2010-05-15', fide_id: '123456', rank: 2 },
    ]);
    // Should detect as FIDE conflict (first in precedence), not name+dob
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].keyKind).toBe('fide');
  });

  it('creates name+dob conflict when one record has FIDE and one does not', () => {
    const conflicts = detectConflictsInDraft([
      { name: 'John Smith', dob: '2010-05-15', fide_id: '123456', rank: 1 },
      { name: 'John Smith', dob: '2010-05-15', rank: 2 }, // no FIDE
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].keyKind).toBe('nameDob');
    expect(conflicts[0].reason).toBe('Same name + DOB (one record missing FIDE ID)');
  });

  it('creates name+dob conflict when both records have no FIDE ID', () => {
    const conflicts = detectConflictsInDraft([
      { name: 'John Smith', dob: '2010-05-15', rank: 1 },
      { name: 'John Smith', dob: '2010-05-15', rank: 2 },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].keyKind).toBe('nameDob');
    expect(conflicts[0].reason).toBe('Same name + DOB');
  });
});

describe('shouldGroupAsNameDobConflict', () => {
  it('returns false when both have different FIDE IDs', () => {
    const result = shouldGroupAsNameDobConflict(
      { fide_id: '123456' },
      { fide_id: '789012' }
    );
    expect(result.shouldConflict).toBe(false);
  });

  it('returns true with special reason when same FIDE ID', () => {
    const result = shouldGroupAsNameDobConflict(
      { fide_id: '123456' },
      { fide_id: '123456' }
    );
    expect(result.shouldConflict).toBe(true);
    expect(result.reason).toBe('Same name + DOB (same FIDE ID)');
  });

  it('returns true with special reason when one FIDE missing', () => {
    const result = shouldGroupAsNameDobConflict(
      { fide_id: '123456' },
      {}
    );
    expect(result.shouldConflict).toBe(true);
    expect(result.reason).toBe('Same name + DOB (one record missing FIDE ID)');
  });

  it('returns true with standard reason when both have no FIDE', () => {
    const result = shouldGroupAsNameDobConflict({}, {});
    expect(result.shouldConflict).toBe(true);
    expect(result.reason).toBe('Same name + DOB');
  });
});

describe('formatConflictReason', () => {
  it('formats FIDE conflicts', () => {
    const result = formatConflictReason('fide', '123456');
    expect(result).toBe('Same FIDE ID: 123456');
  });

  it('formats name+dob conflicts with human-readable output', () => {
    const result = formatConflictReason('nameDob', 'john smith::2010-05-15', 'Same name + DOB');
    expect(result).toContain('John Smith');
    expect(result).toContain('2010-05-15');
    expect(result).toContain('Same name + DOB');
  });

  it('formats sno conflicts', () => {
    const result = formatConflictReason('sno', '42');
    expect(result).toBe('Duplicate serial number: 42');
  });
});

describe('conflict resolution types', () => {
  it('supports keepBoth resolution for name+dob conflicts', () => {
    // Verify that name+dob conflicts can be detected even when they are different people
    const conflicts = detectConflictsInDraft([
      { name: 'John Smith', dob: '2010-05-15', rank: 1, _originalIndex: 0, rating: 1200 },
      { name: 'John Smith', dob: '2010-05-15', rank: 2, _originalIndex: 1, rating: 1100 },
    ]);
    
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ 
      keyKind: 'nameDob', 
      reason: 'Same name + DOB' 
    });
    
    // When keepBoth is selected, both rows should be preserved (tested in component)
    // This test documents that same name+dob creates a conflict that can be resolved 
    // by keeping both players when the user determines they are different people
    expect(conflicts[0].a).toMatchObject({ rating: 1200 });
    expect(conflicts[0].b).toMatchObject({ rating: 1100 });
  });
});
