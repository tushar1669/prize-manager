import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { AppNav } from '@/components/AppNav';
import { Trophy, Medal, GripVertical } from 'lucide-react';
import { 
  DndContext, 
  closestCenter, 
  PointerSensor, 
  KeyboardSensor, 
  useSensor, 
  useSensors,
  DragEndEvent 
} from '@dnd-kit/core';
import { 
  SortableContext, 
  useSortable, 
  arrayMove, 
  verticalListSortingStrategy, 
  sortableKeyboardCoordinates 
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ErrorPanel from '@/components/ui/ErrorPanel';
import { useErrorPanel } from '@/hooks/useErrorPanel';
import { useDirty } from '@/contexts/DirtyContext';

type Prize = { 
  id: string; 
  place: number; 
  cash_amount: number | null; 
  has_trophy: boolean; 
  has_medal: boolean; 
  is_active?: boolean 
};

type Category = { 
  id: string; 
  name: string; 
  is_main: boolean; 
  order_idx: number; 
  is_active?: boolean; 
  prizes: Prize[] 
};

export default function CategoryOrderReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cats, setCats] = useState<Category[]>([]);
  const [lastSavedOrder, setLastSavedOrder] = useState<Category[]>([]);
  const { error, showError, clearError } = useErrorPanel();
  const { setDirty, resetDirty } = useDirty();

  // DnD sensors (mouse/touch + keyboard)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id,name,is_main,order_idx,is_active,prizes(id,place,cash_amount,has_trophy,has_medal,is_active)')
        .eq('tournament_id', id)
        .order('order_idx', { ascending: true });
      
      if (error) { 
        toast.error(error.message); 
        setLoading(false); 
        return; 
      }
      
      const mapped = (data || []).map((c: any) => ({
        ...c,
        is_active: c.is_active ?? true,
        prizes: (c.prizes || []).map((p: any) => ({ ...p, is_active: p.is_active ?? true })),
      }));
      console.log('[order-review] loaded', mapped.map(c => ({ id: c.id, name: c.name, order_idx: c.order_idx, is_active: c.is_active, prizes: (c.prizes||[]).length })));
      setCats(mapped);
      setLastSavedOrder(mapped); // baseline for rollback on save error
      setLoading(false);
    })();
  }, [id]);

  // Track dirty state when order or active status changes
  useEffect(() => {
    const isDirty = JSON.stringify(cats.map(c => ({ id: c.id, order_idx: c.order_idx, is_active: c.is_active, prizes: c.prizes.map(p => ({ id: p.id, is_active: p.is_active })) }))) 
      !== JSON.stringify(lastSavedOrder.map(c => ({ id: c.id, order_idx: c.order_idx, is_active: c.is_active, prizes: c.prizes.map(p => ({ id: p.id, is_active: p.is_active })) })));
    setDirty('order-review', isDirty);
  }, [cats, lastSavedOrder, setDirty]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setCats((prev: Category[]) => {
      const oldIdx = prev.findIndex((c: Category) => c.id === active.id);
      const newIdx = prev.findIndex((c: Category) => c.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;

      const reordered = arrayMove(prev, oldIdx, newIdx);
      console.log('[order-review] dnd end', reordered.map((c: Category, i: number) => ({ id: c.id, name: c.name, order: i })));
      return reordered;
    });
  };

  const handleConfirm = async () => {
    try {
      setSaving(true);
      
      // Build bulk updates
      const catUpdates = cats.map((c, i) => ({ 
        id: c.id, 
        order_idx: i, 
        is_active: c.is_active ?? true 
      }));
      const prizeUpdates = cats.flatMap(c => 
        (c.prizes || []).map(p => ({ 
          id: p.id, 
          is_active: p.is_active ?? true 
        }))
      );
      
      console.log('[order-review] saving', { 
        categories: catUpdates, 
        prizes: prizeUpdates.length 
      });
      
      // Bulk update categories using Promise.all for performance
      await Promise.all(
        catUpdates.map(c => 
          supabase
            .from('categories')
            .update({ order_idx: c.order_idx, is_active: c.is_active })
            .eq('id', c.id)
        )
      );
      
      // Bulk update prizes if any
      if (prizeUpdates.length > 0) {
        await Promise.all(
          prizeUpdates.map(p => 
            supabase
              .from('prizes')
              .update({ is_active: p.is_active })
              .eq('id', p.id)
          )
        );
      }
      
      setLastSavedOrder(cats); // update baseline after successful save
      resetDirty('order-review');
      clearError();
      toast.success('Order & selections saved');
      navigate(`/t/${id}/import`);
    } catch (err: any) {
      console.error('[order-review] save error', err);
      setCats(lastSavedOrder); // rollback visual order
      showError({
        title: 'Failed to save order',
        message: err?.message || 'Unknown error',
        hint: 'Your changes have been reverted. Please try again.',
      });
      toast.error(err?.message || 'Failed to save order');
    } finally {
      setSaving(false);
    }
  };

  // Sortable category item component
  function SortableCategoryItem({
    cat,
    onToggleCat,
    onTogglePrize,
  }: {
    cat: Category;
    onToggleCat: (id: string) => void;
    onTogglePrize: (cid: string, pid: string) => void;
  }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.6 : undefined,
    } as React.CSSProperties;

    return (
      <Card ref={setNodeRef} style={style} className="overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            {/* Drag handle (keyboard accessible) */}
            <button
              className="p-2 rounded hover:bg-muted/60 cursor-grab active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Drag to reorder"
              title="Drag to reorder. Press space or enter to pick up, arrow keys to move, enter to drop."
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-5 w-5 text-muted-foreground" />
            </button>

            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={!!cat.is_active}
                  onCheckedChange={() => onToggleCat(cat.id)}
                  aria-label={`Include ${cat.name}`}
                />
                <span className="font-semibold text-lg">{cat.name}</span>
                {cat.is_main && (
                  <span className="px-2 py-1 text-xs rounded-md bg-primary/10 text-primary border border-primary/30">
                    Main
                  </span>
                )}
              </div>

              <div className="grid gap-2 pl-8">
                {(cat.prizes || []).sort((a, b) => a.place - b.place).map(p => (
                  <div key={p.id} className="flex items-center gap-3 text-sm">
                    <Checkbox
                      checked={!!p.is_active}
                      onCheckedChange={() => onTogglePrize(cat.id, p.id)}
                      aria-label={`Include prize place #${p.place}`}
                    />
                    <span className="w-20 font-medium">Place #{p.place}</span>
                    <span className="w-28 font-mono">₹{p.cash_amount ?? 0}</span>
                    <div className="flex gap-1 text-muted-foreground">
                      {p.has_trophy && <Trophy className="h-4 w-4" />}
                      {p.has_medal && <Medal className="h-4 w-4" />}
                    </div>
                  </div>
                ))}
                {(!cat.prizes || cat.prizes.length === 0) && (
                  <div className="text-sm text-muted-foreground">No prizes in this category.</div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppNav />
        <div className="p-6">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <div className="container max-w-5xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Review Category Order</h1>
          <p className="text-muted-foreground mt-2">
            Reorder categories and choose which categories/prizes are included in allocation.
            This order becomes brochure priority for prize allocation.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            💡 Drag rows to set brochure order. This order becomes the source of truth for allocation priority.
          </p>
        </div>

        <ErrorPanel error={error} onDismiss={clearError} />

        <div className="space-y-4">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={cats.map(c => c.id)} strategy={verticalListSortingStrategy}>
              {cats.map((c: Category) => (
                <SortableCategoryItem
                  key={c.id}
                  cat={c}
                  onToggleCat={(cid) => {
                    console.log('[order-review] toggle category', { categoryId: cid });
                    setCats(prev => prev.map(x => x.id === cid ? { ...x, is_active: !x.is_active } : x));
                  }}
                  onTogglePrize={(cid, pid) => {
                    console.log('[order-review] toggle prize', { categoryId: cid, prizeId: pid });
                    setCats(prev => prev.map(x =>
                      x.id === cid
                        ? { ...x, prizes: (x.prizes || []).map((p: Prize) => p.id === pid ? { ...p, is_active: !p.is_active } : p) }
                        : x
                    ));
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={() => navigate(`/t/${id}/setup?tab=prizes`)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving ? 'Saving…' : 'Confirm & Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}
