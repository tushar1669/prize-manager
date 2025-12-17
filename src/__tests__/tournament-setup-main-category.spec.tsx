// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ensureMainCategoryExists } from '@/pages/TournamentSetup';
import CategoryPrizesEditor from '@/components/prizes/CategoryPrizesEditor';
import { DirtyProvider } from '@/contexts/DirtyContext';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('TournamentSetup main category safeguards', () => {
  it('creates a main category when individual mode has none', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabaseClient = { from: vi.fn(() => ({ insert })) } as any;
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const ensuringRef = { current: false } as React.MutableRefObject<boolean>;

    const created = await ensureMainCategoryExists({
      prizeMode: 'individual',
      categories: [{ id: 'c1', is_main: false }],
      categoriesLoading: false,
      tournamentId: 't1',
      supabaseClient,
      queryClient: { invalidateQueries } as any,
      ensuringRef,
    });

    expect(created).toBe(true);
    expect(supabaseClient.from).toHaveBeenCalledWith('categories');
    expect(insert).toHaveBeenCalledWith({
      tournament_id: 't1',
      name: 'Main Prize',
      is_main: true,
      criteria_json: {},
      order_idx: 0,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['categories', 't1'] });
    expect(ensuringRef.current).toBe(true);
  });

  it('does not insert when a main category already exists', async () => {
    const supabaseClient = { from: vi.fn() } as any;
    const invalidateQueries = vi.fn();
    const ensuringRef = { current: false } as React.MutableRefObject<boolean>;

    const created = await ensureMainCategoryExists({
      prizeMode: 'individual',
      categories: [{ id: 'c1', is_main: true }],
      categoriesLoading: false,
      tournamentId: 't1',
      supabaseClient,
      queryClient: { invalidateQueries } as any,
      ensuringRef,
    });

    expect(created).toBe(false);
    expect(supabaseClient.from).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('prevents toggling or deleting the main category in the UI', () => {
    const onToggleCategory = vi.fn();
    const onDeleteCategory = vi.fn();

    render(
      <DirtyProvider>
        <CategoryPrizesEditor
          category={{
            id: 'main',
            name: 'Main Prize',
            is_main: true,
            is_active: true,
            order_idx: 0,
            criteria_json: {},
            prizes: [
              {
                id: 'p1',
                place: 1,
                cash_amount: 100,
                has_trophy: false,
                has_medal: false,
                is_active: true,
              },
            ],
          }}
          onSave={vi.fn() as any}
          onToggleCategory={onToggleCategory}
          onDeleteCategory={onDeleteCategory}
          onDuplicateCategory={vi.fn()}
          onEditRules={vi.fn()}
          isOrganizer
        />
      </DirtyProvider>
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /include main prize/i }));
    expect(onToggleCategory).not.toHaveBeenCalled();
    expect(screen.queryByTitle(/delete category/i)).toBeNull();
  });
});
