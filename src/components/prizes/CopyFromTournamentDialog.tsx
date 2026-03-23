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
  /** 'prizes' = only prize structure (default). 'full' = details + prize structure checkboxes */
  copyMode?: 'prizes' | 'full';
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

const DETAIL_FIELDS = [
  'venue', 'city', 'event_code', 'notes',
  'time_control_base_minutes', 'time_control_increment_seconds',
  'chief_arbiter', 'tournament_director',
  'entry_fee_amount', 'cash_prize_total',
  'chessresults_url', 'public_results_url',
] as const;

export default function CopyFromTournamentDialog({ tournamentId, open, onOpenChange, onComplete, copyMode = 'prizes' }: Props) {
  const { user } = useAuth();
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [copying, setCopying] = useState(false);
  const [copyDetails, setCopyDetails] = useState(true);
  const [copyPrizeStructure, setCopyPrizeStructure] = useState(true);

  const isFullMode = copyMode === 'full';

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
  const showCategoryPicker = isFullMode ? copyPrizeStructure : true;

  const { data: sourceCategories, isLoading: loadingCategories } = useQuery({
    queryKey: ["copy-source-categories", selectedTournamentId],
    enabled: !!selectedTournamentId && showCategoryPicker,
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
      setCopyDetails(true);
      setCopyPrizeStructure(true);
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

  // Determine if confirm button should be enabled
  const canConfirm = useMemo(() => {
    if (!selectedTournamentId) return false;
    if (isFullMode) {
      // At least one section must be checked
      if (!copyDetails && !copyPrizeStructure) return false;
      // If prize structure checked, need selected categories
      if (copyPrizeStructure && selectedCount === 0) return false;
      // If only details checked, that's fine
      return true;
    }
    return selectedCount > 0;
  }, [selectedTournamentId, isFullMode, copyDetails, copyPrizeStructure, selectedCount]);

  // Confirm handler
  const handleConfirm = async () => {
    if (!selectedTournamentId) return;
    setCopying(true);

    try {
      let detailsCopied = false;
      let categoriesCopied = 0;
      let prizesCopied = 0;

      // --- Copy Details ---
      if (isFullMode && copyDetails) {
        const { data: sourceTournament, error: srcErr } = await supabase
          .from("tournaments")
          .select(DETAIL_FIELDS.join(", "))
          .eq("id", selectedTournamentId)
          .single();

        if (srcErr) throw srcErr;

        if (sourceTournament) {
          const updatePayload: Record<string, unknown> = {};
          for (const field of DETAIL_FIELDS) {
            const val = (sourceTournament as unknown as Record<string, unknown>)[field];
            if (val !== null && val !== undefined && val !== '') {
              updatePayload[field] = val;
            }
          }

          if (Object.keys(updatePayload).length > 0) {
            const { error: updateErr } = await supabase
              .from("tournaments")
              .update(updatePayload)
              .eq("id", tournamentId);

            if (updateErr) throw updateErr;
            detailsCopied = true;
          }
        }
      }

      // --- Copy Prize Structure ---
      const shouldCopyPrizes = isFullMode ? copyPrizeStructure : true;

      if (shouldCopyPrizes && sourceCategories && selectedCount > 0) {
        // Fetch existing target categories
        const { data: targetCategories, error: targetErr } = await supabase
          .from("categories")
          .select("id, is_main, order_idx")
          .eq("tournament_id", tournamentId)
          .eq("is_active", true);

        if (targetErr) throw targetErr;

        const targetMainCat = (targetCategories ?? []).find((c) => c.is_main);
        const maxOrderIdx = (targetCategories ?? []).reduce(
          (max, c) => Math.max(max, c.order_idx ?? 0),
          -1
        );

        const selectedCats = sourceCategories.filter((c) => selectedCategoryIds.has(c.id));
        selectedCats.sort((a, b) => (a.order_idx ?? 0) - (b.order_idx ?? 0));

        let mainHandled = false;

        for (let i = 0; i < selectedCats.length; i++) {
          const src = selectedCats[i];
          const srcIsMain = !!src.is_main;

          // --- MAIN CATEGORY MERGE LOGIC ---
          if (srcIsMain && targetMainCat) {
            // Merge into existing target Main: delete old prizes, insert source prizes
            const targetMainId = targetMainCat.id;

            // Delete existing prizes in target Main
            await supabase.from("prizes").delete().eq("category_id", targetMainId);

            // Update target Main category criteria from source
            const criteria = { ...(src.criteria_json ?? {}) };
            delete criteria.dob_on_or_after;

            await supabase
              .from("categories")
              .update({ criteria_json: JSON.parse(JSON.stringify(criteria)) })
              .eq("id", targetMainId);

            // Insert source prizes into target Main
            if (src.prizes && src.prizes.length > 0) {
              const prizeRows = src.prizes.map((p) => ({
                category_id: targetMainId,
                place: p.place,
                cash_amount: p.cash_amount ?? 0,
                has_trophy: p.has_trophy ?? false,
                has_medal: p.has_medal ?? false,
                gift_items: coerceGiftItems(p.gift_items),
                is_active: true,
              }));

              const { error: prizeErr } = await supabase.from("prizes").insert(prizeRows);
              if (prizeErr) {
                console.error("[copy] main prizes insert error", prizeErr.message);
                toast.error(`Prizes for Main category failed: ${prizeErr.message}`);
              } else {
                prizesCopied += prizeRows.length;
              }
            }

            categoriesCopied++;
            mainHandled = true;
            continue;
          }

          // --- NEW MAIN (no target main exists) ---
          let importIsMain = srcIsMain;
          let importName = src.name;

          if (importIsMain) {
            if (mainHandled) {
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
              criteria_json: JSON.parse(JSON.stringify(criteria)),
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
      }

      // Build success message
      const parts: string[] = [];
      if (detailsCopied) parts.push("details");
      if (categoriesCopied > 0) {
        parts.push(`${categoriesCopied} categor${categoriesCopied === 1 ? "y" : "ies"} with ${prizesCopied} prize${prizesCopied === 1 ? "" : "s"}`);
      }
      if (parts.length > 0) {
        toast.success(`Copied ${parts.join(" and ")}`);
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

  // Build button label
  const getButtonLabel = () => {
    if (copying) return "Copying…";
    if (isFullMode) {
      const parts: string[] = [];
      if (copyDetails) parts.push("Details");
      if (copyPrizeStructure && selectedCount > 0) parts.push(`${selectedCount} Categor${selectedCount === 1 ? "y" : "ies"}`);
      return parts.length > 0 ? `Copy ${parts.join(" + ")}` : "Copy";
    }
    return `Copy ${selectedCount > 0 ? selectedCount : ""} Categor${selectedCount === 1 ? "y" : "ies"}`;
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
            {isFullMode
              ? "Import tournament details and/or prize structure from one of your other tournaments."
              : "Import prize categories and prizes from one of your other tournaments."}
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

          {/* Full mode: section checkboxes */}
          {isFullMode && selectedTournamentId && (
            <div className="space-y-3 rounded-md border p-3">
              <Label className="text-sm font-medium">What to copy</Label>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={copyDetails}
                  onCheckedChange={(v) => setCopyDetails(!!v)}
                />
                <div>
                  <span className="text-sm font-medium">Details</span>
                  <p className="text-xs text-muted-foreground">Venue, city, time control, arbiter, fees, etc.</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={copyPrizeStructure}
                  onCheckedChange={(v) => setCopyPrizeStructure(!!v)}
                />
                <div>
                  <span className="text-sm font-medium">Prize Structure</span>
                  <p className="text-xs text-muted-foreground">Categories and prizes (select below)</p>
                </div>
              </label>
            </div>
          )}

          {/* Category preview */}
          {selectedTournamentId && showCategoryPicker && loadingCategories && (
            <p className="text-sm text-muted-foreground">Loading categories…</p>
          )}

          {selectedTournamentId && showCategoryPicker && !loadingCategories && !hasCategories && (
            <p className="text-sm text-muted-foreground">No active categories found in this tournament.</p>
          )}

          {selectedTournamentId && showCategoryPicker && hasCategories && (
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
          <Button onClick={handleConfirm} disabled={copying || !canConfirm}>
            {getButtonLabel()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
