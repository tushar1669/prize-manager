import { coerceGiftItems } from '@/lib/utils';

export type GiftItemLike = { name?: string; qty?: number };

export function formatGiftItems(items: unknown): string {
  const gifts = coerceGiftItems(items);
  if (gifts.length === 0) return '';

  return gifts
    .map((item) => {
      const name = item.name.trim();
      if (!name) return '';
      const qty = Number.isFinite(Number(item.qty)) && Number(item.qty) > 0 ? Number(item.qty) : 1;
      return qty === 1 ? name : `${name} ×${qty}`;
    })
    .filter(Boolean)
    .join(', ');
}
