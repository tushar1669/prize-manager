import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { coerceGiftItems } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Copy } from "lucide-react";
import { toast } from "sonner";

interface Props {
  tournamentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

type SourceCategory = {
  id: string;
  name: string;
  is_main: boolean | null;
  criteria_json: Record<string, unknown>;
  order_idx: number | null;
  prizes: Array<{
    place: number;
    cash_amount: number | null;
    has_trophy: boolean | null;
    has_medal: boolean | null;
    gift_items: unknown;
  }>;
};

export default function CopyFromTournamentDialog({ tournamentId, open, onOpenChange, onComplete }: Props) {
  const { user } = useAuth();
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [copying, setCopying] = useState(false);

  // 1) Load other tournaments owned by this user
  const { data: otherTournaments } = useQuery({
    queryKey: ["copy-source-tournaments", user?.id, tournamentId],
    enabled: open && !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tournaments")
        .select("id, title")
        .eq("owner_id", user!.id)
        .neq("id", tournamentId)
        .is("deleted_at", null)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // 2) Load categories + prizes for selected source tournament
  const { data: sourceCategories, isLoading: loadingCategories } = useQuery({
    queryKey: ["copy-source-categories", selectedTournamentId],
    enabled: !!selectedTournamentId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, is_main, criteria_json, order_idx, prizes(place, cash_amount, has_trophy, has_medal, gift_items)")
        .eq("tournament_id", selectedTournamentId)
        .eq("is_active", true)
        .order("order_idx", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as SourceCategory[];
    },
  });

  const hasCategories = (sourceCategories?.length ?? 0) > 0;

  // Toggle category selection
  const toggleCategory = (catId: string) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const selectAll = () => {
    if (!sourceCategories) return;
    setSelectedCategoryIds(new Set(sourceCategories.map((c) => c.id)));
  };

  const deselectAll = () => setSelectedCategoryIds(new Set());

  // Reset state when tournament changes
  const handleTournamentChange = (val: string) => {
    setSelectedTournamentId(val);
    setSelectedCategoryIds(new Set());
  };

  // Reset on close
  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setSelectedTournamentId("");
      setSelectedCategoryIds(new Set());
    }
    onOpenChange(v);
  };

  const selectedCount = selectedCategoryIds.size;
  const totalPrizes = useMemo(() => {
    if (!sourceCategories) return 0;
    return sourceCategories
      .filter((c) => selectedCategoryIds.has(c.id))
      .reduce((sum, c) => sum + (c.prizes?.length ?? 0), 0);
  }, [sourceCategories, selectedCategoryIds]);

  // Confirm handler
  const handleConfirm = async () => {
    if (!sourceCategories || selectedCount === 0) return;
    setCopying(true);

    try {
      // Fetch existing target categories to check for main + get max order_idx
      const { data: targetCategories, error: targetErr } = await supabase
        .from("categories")
        .select("id, is_main, order_idx")
        .eq("tournament_id", tournamentId)
        .eq("is_active", true);

      if (targetErr) throw targetErr;

      const targetHasMain = (targetCategories ?? []).some((c) => c.is_main);
      const maxOrderIdx = (targetCategories ?? []).reduce(
        (max, c) => Math.max(max, c.order_idx ?? 0),
        -1
      );

      const selectedCats = sourceCategories.filter((c) => selectedCategoryIds.has(c.id));
      // Sort by order_idx to preserve relative order
      selectedCats.sort((a, b) => (a.order_idx ?? 0) - (b.order_idx ?? 0));

      let categoriesCopied = 0;
      let prizesCopied = 0;
      let mainHandled = false; // track if we've already allowed one main through

      for (let i = 0; i < selectedCats.length; i++) {
        const src = selectedCats[i];

        // Determine is_main for imported category
        let importIsMain = !!src.is_main;
        let importName = src.name;

        if (importIsMain) {
          if (targetHasMain || mainHandled) {
            importIsMain = false;
            importName = `${src.name} (imported)`;
          } else {
            mainHandled = true;
          }
        }

        // Strip legacy field from criteria
        const criteria = { ...(src.criteria_json ?? {}) };
        delete criteria.dob_on_or_after;

        const { data: newCat, error: catErr } = await supabase
          .from("categories")
          .insert([{
            tournament_id: tournamentId,
            name: importName,
            is_main: importIsMain,
            criteria_json: criteria as Record<string, unknown>,
            order_idx: maxOrderIdx + 1 + i,
            is_active: true,
          }])
          .select("id")
          .single();

        if (catErr) {
          console.error("[copy] category insert error", catErr.message);
          toast.error(`Failed to copy category "${src.name}": ${catErr.message}`);
          continue;
        }

        categoriesCopied++;

        // Copy prizes for this category
        if (src.prizes && src.prizes.length > 0) {
          const prizeRows = src.prizes.map((p) => ({
            category_id: newCat.id,
            place: p.place,
            cash_amount: p.cash_amount ?? 0,
            has_trophy: p.has_trophy ?? false,
            has_medal: p.has_medal ?? false,
            gift_items: coerceGiftItems(p.gift_items),
            is_active: true,
          }));

          const { error: prizeErr } = await supabase.from("prizes").insert(prizeRows);
          if (prizeErr) {
            console.error("[copy] prizes insert error", prizeErr.message);
            toast.error(`Prizes for "${src.name}" failed: ${prizeErr.message}`);
          } else {
            prizesCopied += prizeRows.length;
          }
        }
      }

      if (categoriesCopied > 0) {
        toast.success(`Copied ${categoriesCopied} categor${categoriesCopied === 1 ? "y" : "ies"} with ${prizesCopied} prize${prizesCopied === 1 ? "" : "s"}`);
      }

      onComplete?.();
      handleOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Copy failed";
      toast.error(msg);
      console.error("[copy] error", err);
    } finally {
      setCopying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Copy from Another Tournament
          </DialogTitle>
          <DialogDescription>
            Import prize categories and prizes from one of your other tournaments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tournament selector */}
          <div className="space-y-2">
            <Label>Source Tournament</Label>
            {otherTournaments && otherTournaments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other tournaments found.</p>
            ) : (
              <Select value={selectedTournamentId} onValueChange={handleTournamentChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a tournament…" />
                </SelectTrigger>
                <SelectContent>
                  {otherTournaments?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Category preview */}
          {selectedTournamentId && loadingCategories && (
            <p className="text-sm text-muted-foreground">Loading categories…</p>
          )}

          {selectedTournamentId && !loadingCategories && !hasCategories && (
            <p className="text-sm text-muted-foreground">No active categories found in this tournament.</p>
          )}

          {selectedTournamentId && hasCategories && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Categories to copy</Label>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
                    Select all
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={deselectAll}>
                    None
                  </Button>
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto rounded-md border p-2 space-y-1">
                {sourceCategories!.map((cat) => (
                  <label
                    key={cat.id}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedCategoryIds.has(cat.id)}
                      onCheckedChange={() => toggleCategory(cat.id)}
                    />
                    <span className="flex-1 text-sm">{cat.name}</span>
                    <div className="flex items-center gap-1.5">
                      {cat.is_main && (
                        <Badge variant="secondary" className="text-xs">Main</Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {cat.prizes?.length ?? 0} prize{(cat.prizes?.length ?? 0) !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </label>
                ))}
              </div>
              {selectedCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedCount} categor{selectedCount === 1 ? "y" : "ies"}, {totalPrizes} prize{totalPrizes !== 1 ? "s" : ""} will be copied.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={copying}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={copying || selectedCount === 0}>
            {copying ? "Copying…" : `Copy ${selectedCount > 0 ? selectedCount : ""} Categor${selectedCount === 1 ? "y" : "ies"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
