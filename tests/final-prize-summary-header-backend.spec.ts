import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FinalPrizeSummaryHeader } from '@/components/final-prize/FinalPrizeSummaryHeader';

describe('FinalPrizeSummaryHeader backend migration visibility', () => {
  it('shows system-issue guidance and suppresses upgrade messaging in button titles', () => {
    const html = renderToString(
      React.createElement(FinalPrizeSummaryHeader, {
        tournamentTitle: 'Test Open',
        winners: [],
        totals: {
          totalPrizes: 0,
          totalCash: 0,
          mainCount: 0,
          categoryCount: 0,
        },
        hasFullAccess: false,
        accessErrorCode: 'backend_migration_missing',
      }),
    );

    expect(html).toContain('System setup issue detected');
    expect(html).toContain('backend migrations are not fully deployed');
    expect(html).toContain('System issue: backend migration missing. Retry later.');
    expect(html).not.toContain('Upgrade to Pro to export');
    expect(html).not.toContain('Upgrade to Pro to print');
  });
});
