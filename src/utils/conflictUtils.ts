/**
 * Conflict detection helpers for player import flow.
 * These utilities provide normalized keys and intra-file collision detection
 * while respecting rank-only tie exceptions.
 */
export type ConflictKeyKind = 'fide' | 'nameDob' | 'sno';

export type ConflictPair = {
  keyKind: ConflictKeyKind;
  key: string;
  reason: string;
  a: Record<string, unknown>;
  b: Record<string, unknown>;
};

type MaybeRow = Record<string, unknown> | null | undefined;

/**
 * Lowercase, trim, collapse spaces, strip punctuation/diacritics and retain [a-z ] only.
 */
export function normName(raw?: string): string {
  if (!raw) return '';
  const normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized.length >= 3 ? normalized : '';
}

/**
 * Canonicalize DOB strings/dates to YYYY-MM-DD.
 */
export function normDob(raw?: string | Date | null): string {
  if (!raw) return '';

  const coerceDate = (value: string | Date): Date | null => {
    if (value instanceof Date) {
      return Number.isFinite(value.getTime()) ? value : null;
    }

    const trimmed = String(value).trim();
    if (!trimmed) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const isoDate = new Date(`${trimmed}T00:00:00Z`);
      return Number.isFinite(isoDate.getTime()) ? isoDate : null;
    }

    // Support DD/MM/YYYY and MM/DD/YYYY variants by relying on Date parsing
    const parsed = new Date(trimmed);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  };

  const date = coerceDate(raw);
  if (!date) return '';

  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const getString = (row: MaybeRow, key: string): string | undefined => {
  if (!row) return undefined;
  const value = row[key];
  if (value == null) return undefined;
  return String(value);
};

/**
 * Extract digits-only FIDE identifier when length is 6-10 digits.
 */
export function buildFideKey(row: MaybeRow): string {
  const raw = getString(row, 'fide_id') ?? getString(row, 'fideId');
  if (!raw) return '';
  const digits = raw.replace(/\D+/g, '');
  return digits && /^[0-9]{6,10}$/.test(digits) ? digits : '';
}

/**
 * Build normalized name+dob key.
 */
export function buildNameDobKey(row: MaybeRow): string {
  const name = normName(getString(row, 'name'));
  const dobValue = (row && (row['dob'] ?? row['dob_raw'])) as string | Date | null | undefined;
  const dob = normDob(dobValue ?? undefined);
  if (!name || !dob) return '';
  return `${name}::${dob}`;
}

/**
 * Build normalized serial number key when > 0.
 */
export function buildSnoKey(row: MaybeRow): string {
  const raw =
    getString(row, 'sno') ??
    getString(row, 'SNo') ??
    getString(row, 'serial') ??
    getString(row, 'serial_no');
  if (!raw) return '';
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return String(Math.trunc(parsed));
}

/**
 * Check if two rows should be treated as a Name+DOB conflict.
 * Returns false (skip conflict) if both have different non-empty FIDE IDs.
 * Returns a reason string describing the conflict type if they should be grouped.
 */
export function shouldGroupAsNameDobConflict(a: MaybeRow, b: MaybeRow): { shouldConflict: boolean; reason: string } {
  const fideA = buildFideKey(a);
  const fideB = buildFideKey(b);

  // If both have FIDE IDs and they differ → different players, no conflict
  if (fideA && fideB && fideA !== fideB) {
    return { shouldConflict: false, reason: '' };
  }

  // If both have same FIDE ID (and it's non-empty) → conflict (same person)
  if (fideA && fideB && fideA === fideB) {
    return { shouldConflict: true, reason: 'Same name + DOB (same FIDE ID)' };
  }

  // If one has FIDE and one doesn't → potential match, flag with special reason
  if ((fideA && !fideB) || (!fideA && fideB)) {
    return { shouldConflict: true, reason: 'Same name + DOB (one record missing FIDE ID)' };
  }

  // Both have no FIDE ID → standard name+dob conflict
  return { shouldConflict: true, reason: 'Same name + DOB' };
}

/**
 * Format a human-readable conflict reason with the key.
 */
export function formatConflictReason(keyKind: ConflictKeyKind, key: string, customReason?: string): string {
  switch (keyKind) {
    case 'fide':
      return `Same FIDE ID: ${key}`;
    case 'nameDob': {
      const [name, dob] = key.split('::');
      const formattedName = name ? name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '';
      const label = customReason || 'Same name + DOB';
      return `${label} ("${formattedName}", ${dob || 'unknown'})`;
    }
    case 'sno':
      return `Duplicate serial number: ${key}`;
    default:
      return `${customReason || 'Conflict'}: ${key}`;
  }
}

const hasKeySignal = (row: MaybeRow): boolean => {
  return Boolean(buildFideKey(row) || buildNameDobKey(row) || buildSnoKey(row));
};

/**
 * Detects if the only shared signal between two rows is rank (ignore as conflict).
 */
export function isRankOnlyCollision(a: MaybeRow, b: MaybeRow): boolean {
  if (!a || !b) return false;
  if (hasKeySignal(a) || hasKeySignal(b)) return false;

  const rankA = Number(a['rank']);
  const rankB = Number(b['rank']);
  if (!Number.isFinite(rankA) || !Number.isFinite(rankB)) {
    return false;
  }
  return rankA === rankB && rankA > 0;
}

const pushConflict = (
  conflicts: ConflictPair[],
  keyKind: ConflictKeyKind,
  key: string,
  reason: string,
  a: MaybeRow,
  b: MaybeRow
) => {
  if (!a || !b) return;
  if (isRankOnlyCollision(a, b)) return;
  conflicts.push({ keyKind, key, reason, a: a as Record<string, unknown>, b: b as Record<string, unknown> });
};

/**
 * Detect intra-file conflicts with precedence: FIDE → Name+DOB → SNo.
 * Name+DOB conflicts are skipped if both rows have different FIDE IDs.
 */
export function detectConflictsInDraft(rows: MaybeRow[]): ConflictPair[] {
  const conflicts: ConflictPair[] = [];
  const byFide = new Map<string, MaybeRow>();
  const byNameDob = new Map<string, MaybeRow>();
  const bySno = new Map<string, MaybeRow>();

  for (const row of rows) {
    if (!row) continue;

    const fideKey = buildFideKey(row);
    if (fideKey) {
      const existing = byFide.get(fideKey);
      if (existing) {
        pushConflict(conflicts, 'fide', fideKey, 'Same FIDE ID', existing, row);
        continue;
      }
      byFide.set(fideKey, row);
    }

    const nameDobKey = buildNameDobKey(row);
    if (nameDobKey) {
      const existing = byNameDob.get(nameDobKey);
      if (existing) {
        // Check if we should actually treat this as a conflict
        const { shouldConflict, reason } = shouldGroupAsNameDobConflict(existing, row);
        if (shouldConflict) {
          pushConflict(conflicts, 'nameDob', nameDobKey, reason, existing, row);
          continue;
        }
        // Different FIDE IDs → not a conflict, treat as different players
        // Don't add to map again to preserve first occurrence tracking
      }
      byNameDob.set(nameDobKey, row);
    }

    const snoKey = buildSnoKey(row);
    if (snoKey) {
      const existing = bySno.get(snoKey);
      if (existing) {
        pushConflict(conflicts, 'sno', snoKey, 'Duplicate serial number', existing, row);
        continue;
      }
      bySno.set(snoKey, row);
    }
  }

  return conflicts;
}
