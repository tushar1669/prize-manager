import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { AppNav } from '@/components/AppNav';
import { ChevronUp, ChevronDown, Trophy, Medal } from 'lucide-react';

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
      setLoading(false);
    })();
  }, [id]);

  const move = (idx: number, dir: -1 | 1) => {
    setCats(prev => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      console.log('[order-review] reorder', next.map((c, i) => ({ id: c.id, name: c.name, order: i })));
      return next;
    });
  };

  const toggleCat = (cid: string) => {
    console.log('[order-review] toggle category', { categoryId: cid });
    setCats(prev => prev.map(c => c.id === cid ? { ...c, is_active: !c.is_active } : c));
  };

  const togglePrize = (cid: string, pid: string) => {
    console.log('[order-review] toggle prize', { categoryId: cid, prizeId: pid });
    setCats(prev => prev.map(c => c.id === cid
      ? { ...c, prizes: c.prizes.map(p => p.id === pid ? { ...p, is_active: !p.is_active } : p) }
      : c
    ));
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
      
      toast.success('Order & selections saved');
      navigate(`/t/${id}/import`);
    } catch (err: any) {
      console.error('[order-review] save error', err);
      toast.error(err?.message || 'Failed to save order');
    } finally {
      setSaving(false);
    }
  };

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
        </div>

        <div className="space-y-4">
          {cats.map((c, idx) => (
            <Card key={c.id} className="overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => move(idx, +1)}
                      disabled={idx === cats.length - 1}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={!!c.is_active}
                        onCheckedChange={() => toggleCat(c.id)}
                      />
                      <span className="font-semibold text-lg">{c.name}</span>
                      {c.is_main && (
                        <span className="px-2 py-1 text-xs rounded-md bg-primary/10 text-primary border border-primary/30">
                          Main
                        </span>
                      )}
                    </div>

                    <div className="grid gap-2 pl-8">
                      {(c.prizes || []).sort((a, b) => a.place - b.place).map(p => (
                        <div key={p.id} className="flex items-center gap-3 text-sm">
                          <Checkbox
                            checked={!!p.is_active}
                            onCheckedChange={() => togglePrize(c.id, p.id)}
                          />
                          <span className="w-20 font-medium">Place #{p.place}</span>
                          <span className="w-28 font-mono">₹{p.cash_amount ?? 0}</span>
                          <div className="flex gap-1 text-muted-foreground">
                            {p.has_trophy && <Trophy className="h-4 w-4" />}
                            {p.has_medal && <Medal className="h-4 w-4" />}
                          </div>
                        </div>
                      ))}
                      {(!c.prizes || c.prizes.length === 0) && (
                        <div className="text-sm text-muted-foreground">No prizes in this category.</div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
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
