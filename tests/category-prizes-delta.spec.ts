import { describe, expect, it } from 'vitest';
import { prepareCategoryPrizeUpsertRows } from '../src/components/prizes/prizeDeltaUtils';
import { PrizeDelta } from '../src/components/prizes/CategoryPrizesEditor';

describe('prepareCategoryPrizeUpsertRows', () => {
  it('moves dirty rows without ids into inserts and strips ids from new rows', () => {
    const delta: PrizeDelta = {
      inserts: [
        { place: 1, cash_amount: 100, has_trophy: false, has_medal: true, is_active: true },
      ],
      updates: [
        { id: 'existing-1', place: 2, cash_amount: 50, has_trophy: true, has_medal: false, is_active: true },
        { id: undefined as unknown, place: 3, cash_amount: 25, has_trophy: false, has_medal: false, is_active: true },
      ],
      deletes: [],
    };

    const { validInserts, validUpdates, upsertRows } = prepareCategoryPrizeUpsertRows('cat-1', delta);

    expect(validUpdates).toHaveLength(1);
    expect(validUpdates[0].id).toBe('existing-1');

    expect(validInserts).toHaveLength(2);
    expect(validInserts.every(row => !(row as unknown).id)).toBe(true);

    const place3Row = upsertRows.find(r => r.place === 3);
    expect(place3Row).toBeDefined();
    expect((place3Row as unknown).id).toBeUndefined();
  });
});
