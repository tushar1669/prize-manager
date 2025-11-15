export type WinnerRow = {
  isMain?: boolean;
  orderIdx?: number | null;
  place?: number | null;
};

/**
 * Shared comparator for sorting winners: Main first → brochure order → place
 */
export function byMainOrderPlace(a: WinnerRow, b: WinnerRow): number {
  if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;            // Main first
  const oa = Number.isFinite(a.orderIdx) ? (a.orderIdx as number) : 999;
  const ob = Number.isFinite(b.orderIdx) ? (b.orderIdx as number) : 999;
  if (oa !== ob) return oa - ob;                                   // brochure order
  return (a.place ?? 0) - (b.place ?? 0);                          // then place
}
