import { PrizeDelta } from './CategoryPrizesEditor';

type BasePrizePayload = {
  place: number;
  cash_amount: number;
  has_trophy: boolean;
  has_medal: boolean;
  is_active: boolean;
};

type UpdatePrizePayload = BasePrizePayload & { id: string };

type UpsertRow = BasePrizePayload & { category_id: string; id?: string };

const sanitizeBase = (row: any): BasePrizePayload => ({
  place: Number(row.place) || 0,
  cash_amount: Number(row.cash_amount) || 0,
  has_trophy: !!row.has_trophy,
  has_medal: !!row.has_medal,
  is_active: row.is_active ?? true,
});

const stripId = (row: any): BasePrizePayload => {
  const { _tempId, _status, _error, id: _id, ...rest } = row;
  return sanitizeBase(rest);
};

const sanitizeUpdate = (row: any): UpdatePrizePayload => ({
  ...sanitizeBase(row),
  id: row.id,
});

export const prepareCategoryPrizeUpsertRows = (
  categoryId: string,
  delta: PrizeDelta,
): {
  validInserts: BasePrizePayload[];
  validUpdates: UpdatePrizePayload[];
  upsertRows: UpsertRow[];
} => {
  const recoveredInserts = (delta.updates || []).filter(p => !p.id).map(stripId);
  const normalizedInserts = [
    ...(delta.inserts || []).map(stripId),
    ...recoveredInserts,
  ];

  const validInserts = normalizedInserts.filter(p => Number.isInteger(p.place) && p.place > 0);

  const validUpdates = (delta.updates || [])
    .filter(p => !!p.id)
    .map(sanitizeUpdate)
    .filter(p => Number.isInteger(p.place) && p.place > 0);

  const upsertRows: UpsertRow[] = [
    ...validUpdates.map(p => ({ ...p, category_id: categoryId })),
    ...validInserts.map(p => ({ ...p, category_id: categoryId })),
  ];

  return { validInserts, validUpdates, upsertRows };
};
