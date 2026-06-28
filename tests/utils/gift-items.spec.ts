import { describe, expect, it } from 'vitest';
import { formatGiftItems } from '@/utils/giftItems';

describe('formatGiftItems', () => {
  it('formats a single quantity-one gift without a quantity suffix', () => {
    expect(formatGiftItems([{ name: 'Chess Book', qty: 1 }])).toBe('Chess Book');
  });

  it('formats quantity greater than one with a multiplication symbol', () => {
    expect(formatGiftItems([{ name: 'Chess Book', qty: 2 }])).toBe('Chess Book ×2');
  });

  it('formats multiple gifts with comma separators', () => {
    expect(formatGiftItems([
      { name: 'Chess Book', qty: 2 },
      { name: 'Medal Voucher', qty: 1 },
    ])).toBe('Chess Book ×2, Medal Voucher');
  });

  it('ignores empty names and treats invalid quantities as one', () => {
    expect(formatGiftItems([
      { name: ' ', qty: 4 },
      { name: 'Clock', qty: Number.NaN },
    ])).toBe('Clock');
  });

  it('returns an empty string for no gifts', () => {
    expect(formatGiftItems(undefined)).toBe('');
    expect(formatGiftItems([])).toBe('');
  });
});
