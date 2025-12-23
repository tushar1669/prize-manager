// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TeamGroupPrizesTable from '@/components/team-prizes/TeamGroupPrizesTable';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('TeamGroupPrizesTable hydration gating', () => {
  const basePrize = {
    id: 'p1',
    group_id: 'g1',
    place: 1,
    cash_amount: 100,
    has_medal: false,
    has_trophy: false,
    is_active: true,
  } as const;

  it('keeps dirty draft rows when parent rerenders with equivalent initial prizes', () => {
    const onSave: React.ComponentProps<typeof TeamGroupPrizesTable>['onSave'] = vi.fn(async () => undefined);

    const { rerender } = render(
      <TeamGroupPrizesTable groupId="g1" prizes={[basePrize]} onSave={onSave} canEdit />
    );

    fireEvent.click(screen.getByRole('button', { name: /add prize/i }));

    expect(screen.getAllByRole('spinbutton')).toHaveLength(4);
    expect(screen.getByText(/unsaved changes/i)).toBeTruthy();

    rerender(<TeamGroupPrizesTable groupId="g1" prizes={[{ ...basePrize }]} onSave={onSave} canEdit />);

    expect(screen.getAllByRole('spinbutton')).toHaveLength(4);
    expect(screen.getByText(/unsaved changes/i)).toBeTruthy();
  });
});
