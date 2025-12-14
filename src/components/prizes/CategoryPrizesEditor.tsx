import React, { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Trash2, Plus, Save, Trophy, Medal, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import ErrorPanel from '@/components/ui/ErrorPanel';
import { useErrorPanel } from '@/hooks/useErrorPanel';
import { toast } from 'sonner';
import { useDirty } from '@/contexts/DirtyContext';
import { makeKey, getDraft, clearDraft, formatAge } from '@/utils/autosave';
import { useAutosaveEffect } from '@/hooks/useAutosaveEffect';
import { CategoryCriteriaChips } from './CategoryCriteriaChips';

export interface PrizeRow {
  id?: string;
  place: number;
  cash_amount: number;
  has_trophy: boolean;
  has_medal: boolean;
  is_active: boolean;
  _tempId?: string;
  _status?: 'new' | 'dirty' | 'clean' | 'deleted';
  _error?: string;
}

export interface CategoryRow {
  id: string;
  name: string;
  is_main: boolean;
  is_active: boolean;
  order_idx: number;
  category_type?: string | null;
  criteria_json?: any;
  prizes: PrizeRow[];
}

export interface PrizeDelta {
  inserts: Omit<PrizeRow, 'id' | '_tempId' | '_status'>[];
  updates: (Omit<PrizeRow, '_tempId' | '_status'> & { id: string })[];
  deletes: string[];
}

export interface CategoryPrizesEditorHandle {
  categoryId: string;
  computeDelta: () => PrizeDelta;
  validate: () => string | null;
  hasDirty: () => boolean;
  markSaved: () => void;
}

export type CategoryPrizesEditorRef = React.RefObject<CategoryPrizesEditorHandle>;

interface Props {
  category: CategoryRow;
  onSave: (categoryId: string, delta: PrizeDelta) => Promise<void>;
  onToggleCategory: (categoryId: string, isActive: boolean) => void;
  onEditRules?: (category: CategoryRow) => void;
  onDeleteCategory?: (category: CategoryRow) => void;
  isOrganizer: boolean;
}

const CategoryPrizesEditor = forwardRef<CategoryPrizesEditorHandle, Props>(
  ({ category, onSave, onToggleCategory, onEditRules, onDeleteCategory, isOrganizer }, ref) => {
  const [draft, setDraft] = useState<PrizeRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<PrizeRow[]>([]);
  const { error, showError, clearError } = useErrorPanel();
  const { setDirty, resetDirty } = useDirty();
  const newRowFocusRef = useRef<HTMLInputElement | null>(null);
  
  // Autosave state
  const draftKey = makeKey(`cat:${category.id}:prizes`);
  const [restore, setRestore] = useState<null | { data: any; ageMs: number }>(null);

  // Check for draft on mount or category change
  useEffect(() => {
    const saved = getDraft<any>(draftKey, 1);
    if (saved) setRestore(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.id]);

  // initialize/refresh from props (also when prizes list changes on refetch)
  useEffect(() => {
    const base = (category.prizes || []).map(p => ({ ...p, _status: 'clean' as const }));
    // Compare by stable shape to avoid clobbering live edits unnecessarily
    const normalize = (rows: PrizeRow[]) =>
      JSON.stringify(rows.map(r => ({
        id: r.id,
        place: r.place,
        cash_amount: r.cash_amount,
        has_trophy: r.has_trophy,
        has_medal: r.has_medal,
        is_active: r.is_active,
      })));
    const incoming = normalize(base);
    const current  = normalize(lastSaved);
    // If server data changed (e.g., inserts now have IDs), adopt it
    if (incoming !== current) {
      setDraft(base);
      setLastSaved(base);
    }
  }, [category.id, category.prizes, lastSaved]);

  const visibleRows = useMemo(
    () => draft.filter(p => p._status !== 'deleted').sort((a, b) => (a.place || 0) - (b.place || 0)),
    [draft]
  );

  // Track dirty state for this category
  useEffect(() => {
    const hasDirty = draft.some(p => p._status === 'new' || p._status === 'dirty' || p._status === 'deleted');
    setDirty(`cat-${category.id}`, hasDirty);
  }, [draft, category.id, setDirty]);

  // Autosave when dirty
  const hasDirty = draft.some(p => p._status === 'new' || p._status === 'dirty' || p._status === 'deleted');
  
  useAutosaveEffect({
    key: draftKey,
    data: draft,
    enabled: hasDirty,
    debounceMs: 1000,
    version: 1,
  });

  // Expose imperative API via ref
  useImperativeHandle(ref, () => ({
    categoryId: category.id,
    computeDelta,
    validate: validationError,
    hasDirty: () => draft.some(p => p._status === 'new' || p._status === 'dirty' || p._status === 'deleted'),
    markSaved: () => {
      const cleaned = draft
        .filter(p => p._status !== 'deleted')
        .map(p => ({ ...p, _status: 'clean' as const }));
      setDraft(cleaned);
      setLastSaved(cleaned);
      resetDirty(`cat-${category.id}`);
    },
  }), [category.id, draft, resetDirty]);

  const nextPlace = useMemo(() => {
    const places = draft.filter(p => p._status !== 'deleted').map(p => Number(p.place) || 0);
    return (places.length ? Math.max(...places) : 0) + 1;
  }, [draft]);

  const handleAddRow = () => {
    const row: PrizeRow = {
      _tempId: crypto.randomUUID(),
      _status: 'new',
      place: nextPlace,
      cash_amount: 0,
      has_trophy: false,
      has_medal: false,
      is_active: true,
    };
    console.log('[prizes-cat] add', { categoryId: category.id, tempId: row._tempId });
    setDraft(prev => [...prev, row]);
    // focus the new place input on next tick
    setTimeout(() => newRowFocusRef.current?.focus(), 0);
  };

  const markDirty = (idx: number, patch: Partial<PrizeRow>) => {
    setDraft(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch, _status: next[idx]._status === 'new' ? 'new' : 'dirty' };
      const idOrTemp = next[idx].id || next[idx]._tempId;
      const [field] = Object.keys(patch);
      const value = (patch as any)[field];
      console.log('[prizes-cat] edit', { categoryId: category.id, item: idOrTemp, field, value });
      return next;
    });
  };

  const handleRemove = (idx: number) => {
    setDraft(prev => {
      const next = [...prev];
      const row = next[idx];
      console.log('[prizes-cat] remove', { categoryId: category.id, item: row.id || row._tempId });
      if (row.id) {
        next[idx] = { ...row, _status: 'deleted' };
      } else {
        next.splice(idx, 1);
      }
      return next;
    });
  };

  const handleTogglePrizeActive = (idx: number) => {
    setDraft(prev => {
      const next = [...prev];
      const row = next[idx];
      const newVal = !row.is_active;
      console.log('[prizes-cat] toggle prize', { categoryId: category.id, prizeId: row.id || row._tempId, is_active: newVal });
      next[idx] = { ...row, is_active: newVal, _status: row._status === 'new' ? 'new' : 'dirty' };
      return next;
    });
  };

  const validationError = (): string | null => {
    // Clear all errors first
    setDraft(prev => prev.map(p => ({ ...p, _error: undefined })));

    const activeRows = draft.filter(p => p._status !== 'deleted');
    const placeMap = new Map<number, PrizeRow[]>();
    
    // Build map of place -> rows with that place
    for (const row of activeRows) {
      const n = Number(row.place);
      if (!Number.isInteger(n) || n < 1) {
        // Mark invalid place
        setDraft(prev => prev.map(p => 
          (p.id === row.id || p._tempId === row._tempId) 
            ? { ...p, _error: 'Invalid place' }
            : p
        ));
        return `Invalid place: ${n}. Place must be a positive integer.`;
      }
      if (!placeMap.has(n)) placeMap.set(n, []);
      placeMap.get(n)!.push(row);
    }

    // Find duplicates and mark them
    const duplicates: number[] = [];
    for (const [place, rows] of placeMap.entries()) {
      if (rows.length > 1) {
        duplicates.push(place);
        // Mark all duplicate rows with error
        setDraft(prev => prev.map(p => {
          const isDup = rows.some(r => r.id === p.id || r._tempId === p._tempId);
          return isDup ? { ...p, _error: 'Duplicate place' } : p;
        }));
      }
    }

    if (duplicates.length > 0) {
      return `Duplicate places: ${duplicates.sort((a, b) => a - b).join(', ')}. Each place must be unique within the category.`;
    }
    return null;
  };

  const computeDelta = (): PrizeDelta => {
    const inserts = draft
      .filter(p => p._status === 'new' && !p.id)
      .map(p => ({
        place: Number(p.place) || 0,
        cash_amount: Number(p.cash_amount) || 0,
        has_trophy: !!p.has_trophy,
        has_medal: !!p.has_medal,
        is_active: !!p.is_active,
      }));

    const updates = draft
      .filter(p => p._status === 'dirty' && !!p.id)
      .map(p => ({
        id: p.id!,
        place: Number(p.place) || 0,
        cash_amount: Number(p.cash_amount) || 0,
        has_trophy: !!p.has_trophy,
        has_medal: !!p.has_medal,
        is_active: !!p.is_active,
      }));

    const deletes = draft.filter(p => p._status === 'deleted' && !!p.id).map(p => p.id!) || [];

    return { inserts, updates, deletes };
  };

  const handleSave = async () => {
    clearError();
    const v = validationError();
    if (v) {
      showError({ title: 'Validation Error', message: v, hint: 'Fix duplicate/invalid place numbers before saving.' });
      toast.error('Duplicate places in this category. Make each place unique.');
      return;
    }

    const delta = computeDelta();
    
    // Preflight logging
    const duplicateCheck = new Map<number, number>();
    [...delta.inserts, ...delta.updates].forEach(p => {
      duplicateCheck.set(p.place, (duplicateCheck.get(p.place) || 0) + 1);
    });
    const duplicates = Array.from(duplicateCheck.entries()).filter(([_, count]) => count > 1).map(([place]) => place);
    
    console.log('[prizes-cat.preflight]', {
      categoryId: category.id,
      inserts: delta.inserts.length,
      updates: delta.updates.length,
      deletes: delta.deletes.length,
      duplicates: duplicates.length > 0 ? duplicates : 'none'
    });

    try {
      setSaving(true);
      await onSave(category.id, delta);
      // reset statuses to clean & update baseline, clear errors
      const cleaned = draft
        .filter(p => p._status !== 'deleted')
        .map(p => ({ ...p, _status: 'clean' as const, _error: undefined }));
      setDraft(cleaned);
      setLastSaved(cleaned);
      resetDirty(`cat-${category.id}`);
      clearDraft(draftKey);
      toast.success('Category prizes saved');
    } catch (e: any) {
      console.error('[prizes-cat] error', { scope: 'category', message: e?.message || String(e) });
      setDraft(lastSaved); // rollback
      
      // Check if it's a 409 or duplicate error
      const is409 = String(e?.message || '').includes('unique') || String(e?.message || '').includes('duplicate');
      showError({
        title: 'Failed to save prizes',
        message: e?.message || 'Unknown error',
        hint: is409 ? 'Duplicate place detected. Each place must be unique within the category.' : 'Ensure each place is unique within the category.',
      });
      toast.error(e?.message || 'Failed to save prizes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6" data-testid="category-card">
      <CardHeader className="flex flex-col gap-2">
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={category.is_active}
              onCheckedChange={(val: boolean) => onToggleCategory(category.id, !!val)}
              aria-label={`Include ${category.name}`}
            />
            <CardTitle className="text-lg flex items-center gap-2">
              {category.name}
              {hasDirty && (
                <span className="px-2 py-0.5 text-xs font-normal rounded-md bg-amber-100 text-amber-700 border border-amber-200">
                  Unsaved
                </span>
              )}
            </CardTitle>
            {!category.is_main && onEditRules && isOrganizer && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  console.log('[rules] opening criteria sheet', { categoryId: category.id });
                  onEditRules(category);
                }}
              >
                Edit Rules
              </Button>
            )}
            {!category.is_main && onDeleteCategory && isOrganizer && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onDeleteCategory(category)}
                title="Delete category"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {/* Criteria summary chips */}
        <CategoryCriteriaChips
          isMain={category.is_main}
          criteria={category.criteria_json}
          categoryType={category.category_type}
          className="ml-8"
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <ErrorPanel error={error} onDismiss={() => clearError()} />
        {restore && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div>Saved draft from <strong>{formatAge(restore.ageMs)}</strong> is available.</div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDraft(restore.data || []);
                    setRestore(null);
                  }}
                >
                  Restore
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    clearDraft(draftKey);
                    setRestore(null);
                  }}
                >
                  Discard
                </Button>
              </div>
            </div>
          </div>
        )}
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 bg-card py-2">
          <Button variant="secondary" onClick={handleAddRow}>
            <Plus className="h-4 w-4 mr-2" />
            Add prize row
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <svg className="h-4 w-4 mr-2 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25"/>
                  <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" opacity="0.75"/>
                </svg>
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Category Prizes
              </>
            )}
          </Button>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left py-2 pr-4 w-20">Place</th>
                  <th className="text-left py-2 pr-4 w-40">Cash (₹)</th>
                  <th className="text-left py-2 pr-4 w-24">Trophy</th>
                  <th className="text-left py-2 pr-4 w-24">Medal</th>
                  <th className="text-right py-2 pl-4 w-16"> </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, idx) => {
                  const rowIndex = draft.findIndex(p => (p.id || p._tempId) === (row.id || row._tempId));
                  const onFirst = idx === visibleRows.length - 1 && row._status === 'new';
                  return (
                    <tr key={row.id || row._tempId} className={cn('border-t')}>
                      <td className="py-2 pr-4">
                        <div className="space-y-1">
                          <Input
                            ref={onFirst ? newRowFocusRef : undefined}
                            type="number"
                            min={1}
                            value={row.place ?? ''}
                            onChange={(e) => markDirty(rowIndex, { place: parseInt(e.target.value || '1', 10) })}
                            className={cn("w-20", row._error && "border-destructive focus-visible:ring-destructive")}
                          />
                          {row._error && (
                            <p className="text-xs text-destructive">{row._error}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <Input
                          type="number"
                          min={0}
                          value={row.cash_amount ?? 0}
                          onChange={(e) => markDirty(rowIndex, { cash_amount: parseInt(e.target.value || '0', 10) })}
                          className="w-40"
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={!!row.has_trophy}
                            onCheckedChange={(val) => markDirty(rowIndex, { has_trophy: !!val })}
                            aria-label={`Toggle trophy for place ${row.place}`}
                          />
                          <Trophy className="h-4 w-4 opacity-70" />
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={!!row.has_medal}
                            onCheckedChange={(val) => markDirty(rowIndex, { has_medal: !!val })}
                            aria-label={`Toggle medal for place ${row.place}`}
                          />
                          <Medal className="h-4 w-4 opacity-70" />
                        </div>
                      </td>
                      <td className="py-2 pl-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete prize place ${row.place}`}
                          title={`Delete prize place ${row.place}`}
                          onClick={() => handleRemove(rowIndex)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

CategoryPrizesEditor.displayName = 'CategoryPrizesEditor';

export default CategoryPrizesEditor;
