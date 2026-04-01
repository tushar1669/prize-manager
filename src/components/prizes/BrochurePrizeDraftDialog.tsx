import { useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CheckCircle, Copy, ChevronDown, ChevronRight, FileWarning, ImageOff, ScanSearch, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface BrochurePrizeDraftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: string;
  onApplied?: () => void;
}

type Status =
  | "idle"
  | "loading"
  | "ok_draft"
  | "multi_event_detected"
  | "no_brochure"
  | "unsupported_image_without_ocr"
  | "scanned_or_image_only"
  | "invalid_selected_event"
  | "error";

interface DraftPrize {
  place: number;
  cash_amount: number;
  has_trophy: boolean;
  has_medal: boolean;
  gift_items: string[];
  confidence: string;
  source_text: string;
}

interface DraftCategory {
  name: string;
  is_main: boolean;
  order_idx: number;
  confidence: string;
  warnings: string[];
  criteria_json: Record<string, never>;
  prizes: DraftPrize[];
}

interface DraftTeamGroup {
  name: string;
  group_by: string;
  team_size: number;
  confidence: string;
  warnings: string[];
  prizes: DraftPrize[];
}

interface DraftResult {
  source: string;
  file_path: string;
  overall_confidence: string;
  warnings: string[];
  categories: DraftCategory[];
  team_groups: DraftTeamGroup[];
}

interface ApiResponse {
  status: string;
  page_count?: number;
  text_length?: number;
  events?: string[];
  selected_event?: string | null;
  draft?: DraftResult;
  error?: string;
  message?: string;
}

interface ApplyReport {
  categories_created: number;
  categories_reused: number;
  prizes_created: number;
  prizes_skipped: number;
  team_groups_created: number;
  team_groups_reused: number;
  team_prizes_created: number;
  team_prizes_skipped: number;
}

const confidenceBadge = (c: string) => {
  const map: Record<string, { className: string; label: string }> = {
    HIGH: { className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300", label: "High" },
    MEDIUM: { className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300", label: "Medium" },
    LOW: { className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300", label: "Low" },
  };
  const entry = map[c] ?? map.LOW;
  return <Badge variant="outline" className={entry.className}>{entry.label}</Badge>;
};

const formatCurrency = (n: number) =>
  n === 0 ? "—" : `₹${n.toLocaleString("en-IN")}`;

/** Convert draft string[] gift_items to DB shape [{name, qty}] with dedup+counting */
function convertGiftItems(items: string[]): Array<{ name: string; qty: number }> {
  if (!items || items.length === 0) return [];
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.trim();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([name, qty]) => ({ name, qty }));
}

async function applyDraftAddOnly(
  tournamentId: string,
  draft: DraftResult,
  includeTeamGroups: boolean,
  verifiedTeamGroups: Set<number>,
): Promise<ApplyReport> {
  const report: ApplyReport = {
    categories_created: 0,
    categories_reused: 0,
    prizes_created: 0,
    prizes_skipped: 0,
    team_groups_created: 0,
    team_groups_reused: 0,
    team_prizes_created: 0,
    team_prizes_skipped: 0,
  };

  // Step 1: Fetch existing categories
  const { data: existingCats, error: catErr } = await supabase
    .from("categories")
    .select("id, name, is_main, order_idx")
    .eq("tournament_id", tournamentId)
    .eq("is_active", true);
  if (catErr) throw new Error(`Failed to fetch categories: ${catErr.message}`);

  const cats = existingCats || [];
  let resolvedMainCategoryId: string | null = cats.find((c) => c.is_main)?.id ?? null;
  const catByNormName = new Map(cats.map((c) => [c.name.trim().toLowerCase(), c]));
  let maxOrderIdx = cats.reduce((m, c) => Math.max(m, c.order_idx ?? 0), 0);

  // Step 2: Resolve category IDs (create or reuse)
  const categoryIdMap: Array<{ draftIdx: number; categoryId: string }> = [];

  for (let i = 0; i < draft.categories.length; i++) {
    const dc = draft.categories[i];
    const normName = dc.name.trim().toLowerCase();
    const existing = catByNormName.get(normName);

    // Main category: resolve one canonical target id for this entire apply run.
    if (dc.is_main) {
      if (resolvedMainCategoryId) {
        categoryIdMap.push({ draftIdx: i, categoryId: resolvedMainCategoryId });
        report.categories_reused++;
        continue;
      }

      if (existing) {
        resolvedMainCategoryId = existing.id;
        categoryIdMap.push({ draftIdx: i, categoryId: existing.id });
        report.categories_reused++;
        continue;
      }

      maxOrderIdx++;
      const { data: inserted, error: insErr } = await supabase
        .from("categories")
        .insert({
          tournament_id: tournamentId,
          name: dc.name.trim(),
          is_main: true,
          criteria_json: {},
          order_idx: maxOrderIdx,
          is_active: true,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(`Failed to create category "${dc.name}": ${insErr.message}`);

      resolvedMainCategoryId = inserted.id;
      categoryIdMap.push({ draftIdx: i, categoryId: inserted.id });
      catByNormName.set(normName, { id: inserted.id, name: dc.name, is_main: true, order_idx: maxOrderIdx });
      report.categories_created++;
      continue;
    }

    // Non-main category: match by name, else create.
    if (existing) {
      categoryIdMap.push({ draftIdx: i, categoryId: existing.id });
      report.categories_reused++;
      continue;
    }

    maxOrderIdx++;
    const { data: inserted, error: insErr } = await supabase
      .from("categories")
      .insert({
        tournament_id: tournamentId,
        name: dc.name.trim(),
        is_main: false,
        criteria_json: {},
        order_idx: maxOrderIdx,
        is_active: true,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(`Failed to create category "${dc.name}": ${insErr.message}`);

    categoryIdMap.push({ draftIdx: i, categoryId: inserted.id });
    catByNormName.set(normName, { id: inserted.id, name: dc.name, is_main: false, order_idx: maxOrderIdx });
    report.categories_created++;
  }

  // Step 3: Fetch existing prizes for all target categories
  const targetCatIds = [...new Set(categoryIdMap.map((m) => m.categoryId))];
  const { data: existingPrizes, error: pErr } = await supabase
    .from("prizes")
    .select("category_id, place")
    .in("category_id", targetCatIds)
    .eq("is_active", true);
  if (pErr) throw new Error(`Failed to fetch prizes: ${pErr.message}`);

  const existingPlaceMap = new Map<string, Set<number>>();
  for (const p of existingPrizes || []) {
    const key = p.category_id;
    if (!existingPlaceMap.has(key)) existingPlaceMap.set(key, new Set());
    existingPlaceMap.get(key)!.add(p.place);
  }

  // Step 4: Build and insert missing prizes
  const prizeRows: Array<{
    category_id: string;
    place: number;
    cash_amount: number;
    has_trophy: boolean;
    has_medal: boolean;
    gift_items: Array<{ name: string; qty: number }>;
    is_active: boolean;
  }> = [];

  for (const mapping of categoryIdMap) {
    const dc = draft.categories[mapping.draftIdx];
    const existingPlaces = existingPlaceMap.get(mapping.categoryId) || new Set<number>();

    for (const dp of dc.prizes) {
      if (existingPlaces.has(dp.place)) {
        report.prizes_skipped++;
        continue;
      }
      prizeRows.push({
        category_id: mapping.categoryId,
        place: dp.place,
        cash_amount: dp.cash_amount,
        has_trophy: dp.has_trophy,
        has_medal: dp.has_medal,
        gift_items: convertGiftItems(dp.gift_items),
        is_active: true,
      });
    }
  }

  if (prizeRows.length > 0) {
    // Insert in chunks of 200
    for (let i = 0; i < prizeRows.length; i += 200) {
      const chunk = prizeRows.slice(i, i + 200);
      const { error: prizeInsErr } = await supabase.from("prizes").insert(chunk);
      if (prizeInsErr) throw new Error(`Failed to insert prizes: ${prizeInsErr.message}`);
    }
    report.prizes_created = prizeRows.length;
  }

  // Step 5: Team groups (only if opted in and all verified)
  if (includeTeamGroups && draft.team_groups.length > 0) {
    const allVerified = draft.team_groups.every((_, idx) => verifiedTeamGroups.has(idx));
    if (!allVerified) {
      toast.warning("Some team groups were not verified — skipping team groups.");
    } else {
      // Fetch existing team groups
      const { data: existingGroups, error: gErr } = await supabase
        .from("institution_prize_groups")
        .select("id, name")
        .eq("tournament_id", tournamentId)
        .eq("is_active", true);
      if (gErr) throw new Error(`Failed to fetch team groups: ${gErr.message}`);

      const groupByNorm = new Map((existingGroups || []).map((g) => [g.name.trim().toLowerCase(), g]));
      const groupIdMap: Array<{ draftIdx: number; groupId: string }> = [];

      for (let i = 0; i < draft.team_groups.length; i++) {
        const tg = draft.team_groups[i];
        const normName = tg.name.trim().toLowerCase();
        const existing = groupByNorm.get(normName);

        if (existing) {
          groupIdMap.push({ draftIdx: i, groupId: existing.id });
          report.team_groups_reused++;
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from("institution_prize_groups")
            .insert({
              tournament_id: tournamentId,
              name: tg.name.trim(),
              group_by: tg.group_by || "club",
              team_size: tg.team_size || 3,
              female_slots: 0,
              male_slots: 0,
              scoring_mode: "by_top_k_score",
              is_active: true,
            })
            .select("id")
            .single();
          if (insErr) throw new Error(`Failed to create team group "${tg.name}": ${insErr.message}`);
          groupIdMap.push({ draftIdx: i, groupId: inserted.id });
          groupByNorm.set(normName, { id: inserted.id, name: tg.name });
          report.team_groups_created++;
        }
      }

      // Fetch existing team prizes
      const targetGroupIds = [...new Set(groupIdMap.map((m) => m.groupId))];
      const { data: existingTeamPrizes, error: tpErr } = await supabase
        .from("institution_prizes")
        .select("group_id, place")
        .in("group_id", targetGroupIds)
        .eq("is_active", true);
      if (tpErr) throw new Error(`Failed to fetch team prizes: ${tpErr.message}`);

      const teamPlaceMap = new Map<string, Set<number>>();
      for (const tp of existingTeamPrizes || []) {
        if (!teamPlaceMap.has(tp.group_id)) teamPlaceMap.set(tp.group_id, new Set());
        teamPlaceMap.get(tp.group_id)!.add(tp.place);
      }

      const teamPrizeRows: Array<{
        group_id: string;
        place: number;
        cash_amount: number;
        has_trophy: boolean;
        has_medal: boolean;
        is_active: boolean;
      }> = [];

      for (const mapping of groupIdMap) {
        const tg = draft.team_groups[mapping.draftIdx];
        const existingPlaces = teamPlaceMap.get(mapping.groupId) || new Set<number>();

        for (const dp of tg.prizes) {
          if (existingPlaces.has(dp.place)) {
            report.team_prizes_skipped++;
            continue;
          }
          teamPrizeRows.push({
            group_id: mapping.groupId,
            place: dp.place,
            cash_amount: dp.cash_amount,
            has_trophy: dp.has_trophy,
            has_medal: dp.has_medal,
            is_active: true,
          });
        }
      }

      if (teamPrizeRows.length > 0) {
        const { error: tpInsErr } = await supabase.from("institution_prizes").insert(teamPrizeRows);
        if (tpInsErr) throw new Error(`Failed to insert team prizes: ${tpInsErr.message}`);
        report.team_prizes_created = teamPrizeRows.length;
      }
    }
  }

  return report;
}

export default function BrochurePrizeDraftDialog({
  open,
  onOpenChange,
  tournamentId,
  onApplied,
}: BrochurePrizeDraftDialogProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [expandedJson, setExpandedJson] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());

  // Apply state
  const [applying, setApplying] = useState(false);
  const [applyReport, setApplyReport] = useState<ApplyReport | null>(null);
  const [includeTeamGroups, setIncludeTeamGroups] = useState(false);
  const [verifiedTeamGroups, setVerifiedTeamGroups] = useState<Set<number>>(new Set());

  const callFunction = useCallback(
    async (selectedEvent?: string | null) => {
      setStatus("loading");
      setApplyReport(null);
      try {
        const { data, error } = await supabase.functions.invoke("parseBrochurePrizes", {
          body: {
            tournament_id: tournamentId,
            mode: "draft",
            ...(selectedEvent ? { selected_event: selectedEvent } : {}),
          },
        });

        if (error) {
          setStatus("error");
          setResponse({ status: "error", message: error.message });
          return;
        }

        const resp = data as ApiResponse;
        setResponse(resp);

        switch (resp.status) {
          case "ok_draft":
            setStatus("ok_draft");
            break;
          case "multi_event_detected":
            setEvents(resp.events ?? []);
            setStatus("multi_event_detected");
            break;
          case "no_brochure":
          case "unsupported_image_without_ocr":
          case "scanned_or_image_only":
          case "invalid_selected_event":
            setStatus(resp.status as Status);
            break;
          default:
            setStatus("error");
        }
      } catch (err) {
        setStatus("error");
        setResponse({ status: "error", message: err instanceof Error ? err.message : "Unknown error" });
      }
    },
    [tournamentId],
  );

  // Trigger parse when dialog opens and status is idle
  useEffect(() => {
    if (open && status === "idle") {
      callFunction();
    }
  }, [open, status, callFunction]);

  const handleOpen = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setStatus("idle");
        setResponse(null);
        setEvents([]);
        setExpandedJson(false);
        setExpandedCategories(new Set());
        setApplyReport(null);
        setApplying(false);
        setIncludeTeamGroups(false);
        setVerifiedTeamGroups(new Set());
      }
      onOpenChange(nextOpen);
    },
    [callFunction, onOpenChange, status],
  );

  const handleApply = useCallback(async () => {
    const draft = response?.draft;
    if (!draft || applying) return;

    setApplying(true);
    try {
      const report = await applyDraftAddOnly(
        tournamentId,
        draft,
        includeTeamGroups,
        verifiedTeamGroups,
      );
      setApplyReport(report);

      const parts: string[] = [];
      if (report.categories_created > 0) parts.push(`${report.categories_created} categories created`);
      if (report.prizes_created > 0) parts.push(`${report.prizes_created} prizes created`);
      if (report.prizes_skipped > 0) parts.push(`${report.prizes_skipped} prizes skipped (existing)`);
      if (report.team_groups_created > 0) parts.push(`${report.team_groups_created} team groups created`);
      if (report.team_prizes_created > 0) parts.push(`${report.team_prizes_created} team prizes created`);

      if (parts.length === 0) {
        toast.info("Nothing new to add — all categories and prizes already exist.");
      } else {
        toast.success(`Applied: ${parts.join(", ")}`);
      }

      onApplied?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply draft");
    } finally {
      setApplying(false);
    }
  }, [response?.draft, applying, tournamentId, includeTeamGroups, verifiedTeamGroups, onApplied]);

  const handleCopyJson = () => {
    if (response?.draft) {
      navigator.clipboard.writeText(JSON.stringify(response.draft, null, 2));
      toast.success("Draft JSON copied to clipboard");
    }
  };

  const toggleCategory = (idx: number) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleTeamGroupVerified = (idx: number) => {
    setVerifiedTeamGroups((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const draft = response?.draft;
  const totalPrizes = draft
    ? draft.categories.reduce((s, c) => s + c.prizes.length, 0) + draft.team_groups.reduce((s, t) => s + t.prizes.length, 0)
    : 0;

  const hasCategories = draft && draft.categories.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Draft Prize Structure</DialogTitle>
          <DialogDescription>
            Auto-generated from brochure PDF — preview & apply
          </DialogDescription>
        </DialogHeader>

        {/* Loading */}
        {status === "loading" && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="text-sm text-muted-foreground">Parsing brochure…</p>
          </div>
        )}

        {/* Multi-event picker */}
        {status === "multi_event_detected" && (
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-4">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Multiple events detected</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This brochure contains prizes for multiple events. Select which event to parse:
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {events.map((ev) => (
                <Button key={ev} variant="outline" onClick={() => callFunction(ev)}>
                  {ev}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Error states */}
        {status === "no_brochure" && (
          <ErrorCard
            icon={<FileWarning className="h-6 w-6" />}
            title="No brochure uploaded"
            description="Upload a brochure PDF on the Details tab first, then try again."
          />
        )}

        {status === "unsupported_image_without_ocr" && (
          <ErrorCard
            icon={<ImageOff className="h-6 w-6" />}
            title="Image brochures aren't supported yet"
            description="OCR is not available. Please upload a text-based PDF brochure, or enter prizes manually using the XLSX template."
          />
        )}

        {status === "scanned_or_image_only" && (
          <ErrorCard
            icon={<ScanSearch className="h-6 w-6" />}
            title="Scanned / image-only PDF"
            description="This PDF appears to contain only scanned images with no extractable text. Upload a text-based PDF or enter prizes manually."
          />
        )}

        {status === "invalid_selected_event" && (
          <div className="space-y-4 py-4">
            <ErrorCard
              icon={<AlertTriangle className="h-6 w-6" />}
              title="Invalid event selection"
              description="The selected event was not found in this brochure. Please pick one of the detected events."
            />
            {response?.events && response.events.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {response.events.map((ev) => (
                  <Button key={ev} variant="outline" onClick={() => callFunction(ev)}>
                    {ev}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {status === "error" && (
          <ErrorCard
            icon={<AlertTriangle className="h-6 w-6" />}
            title="Parsing failed"
            description={response?.message ?? "An unexpected error occurred. Try again or enter prizes manually."}
          />
        )}

        {/* ok_draft — summary + collapsible detail + apply */}
        {status === "ok_draft" && draft && (
          <div className="space-y-4">
            {/* Apply report */}
            {applyReport && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30 p-4 space-y-1">
                <p className="font-medium text-sm flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  Applied successfully
                </p>
                <p className="text-sm text-muted-foreground">
                  Categories: {applyReport.categories_created} created, {applyReport.categories_reused} reused.
                  Prizes: {applyReport.prizes_created} created, {applyReport.prizes_skipped} skipped.
                  {(applyReport.team_groups_created > 0 || applyReport.team_prizes_created > 0) && (
                    <> Team: {applyReport.team_groups_created} groups, {applyReport.team_prizes_created} prizes.</>
                  )}
                </p>
              </div>
            )}

            {/* Summary bar */}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                {draft.categories.length} categories
              </span>
              <span>{totalPrizes} prizes</span>
              {draft.team_groups.length > 0 && (
                <span>{draft.team_groups.length} team groups</span>
              )}
              <span>·</span>
              <span>Confidence: {confidenceBadge(draft.overall_confidence)}</span>
              {response?.selected_event && (
                <Badge variant="secondary">{response.selected_event}</Badge>
              )}
            </div>

            {/* Warnings */}
            {draft.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3 space-y-1">
                {draft.warnings.map((w, i) => (
                  <p key={i} className="text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    {w}
                  </p>
                ))}
              </div>
            )}

            {/* Categories */}
            {draft.categories.map((cat, idx) => (
              <div key={idx} className="rounded-lg border">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => toggleCategory(idx)}
                >
                  <div className="flex items-center gap-2">
                    {expandedCategories.has(idx) ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium text-sm">{cat.name}</span>
                    {cat.is_main && <Badge variant="secondary" className="text-xs">Main</Badge>}
                    {confidenceBadge(cat.confidence)}
                    <span className="text-xs text-muted-foreground">{cat.prizes.length} prizes</span>
                  </div>
                </button>

                {expandedCategories.has(idx) && (
                  <div className="px-4 pb-3 border-t">
                    <table className="w-full text-sm mt-2">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b">
                          <th className="py-1 pr-2">Place</th>
                          <th className="py-1 pr-2">Amount</th>
                          <th className="py-1 pr-2">Awards</th>
                          <th className="py-1">Conf.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cat.prizes.map((p, pi) => (
                          <tr key={pi} className="border-b last:border-0">
                            <td className="py-1.5 pr-2">{ordinal(p.place)}</td>
                            <td className="py-1.5 pr-2">{formatCurrency(p.cash_amount)}</td>
                            <td className="py-1.5 pr-2">
                              {p.has_trophy && <Badge variant="outline" className="mr-1 text-xs">Trophy</Badge>}
                              {p.has_medal && <Badge variant="outline" className="mr-1 text-xs">Medal</Badge>}
                              {p.gift_items.map((g, gi) => (
                                <Badge key={gi} variant="outline" className="mr-1 text-xs">{g}</Badge>
                              ))}
                            </td>
                            <td className="py-1.5">{confidenceBadge(p.confidence)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {cat.warnings.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {cat.warnings.map((w, wi) => (
                          <p key={wi} className="text-xs text-amber-700 dark:text-amber-400">{w}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Team groups */}
            {draft.team_groups.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Team Groups (Low confidence — verify)</h4>
                {draft.team_groups.map((tg, idx) => (
                  <div key={idx} className="rounded-lg border border-dashed p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-sm">{tg.name}</span>
                      {confidenceBadge(tg.confidence)}
                      <span className="text-xs text-muted-foreground">
                        {tg.group_by} · top {tg.team_size}
                      </span>
                    </div>
                    {tg.prizes.map((p, pi) => (
                      <div key={pi} className="text-sm text-muted-foreground">
                        {ordinal(p.place)}: {formatCurrency(p.cash_amount)}
                        {p.has_trophy && " + Trophy"}
                        {p.has_medal && " + Medal"}
                      </div>
                    ))}
                    {tg.warnings.map((w, wi) => (
                      <p key={wi} className="text-xs text-amber-700 dark:text-amber-400 mt-1">{w}</p>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Raw JSON viewer */}
            <div className="border rounded-lg">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-muted/50 transition-colors"
                onClick={() => setExpandedJson(!expandedJson)}
              >
                <span className="text-muted-foreground">Raw JSON</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyJson();
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </Button>
                  {expandedJson ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>
              {expandedJson && (
                <pre className="px-4 pb-3 text-xs overflow-auto max-h-60 border-t bg-muted/20">
                  {JSON.stringify(draft, null, 2)}
                </pre>
              )}
            </div>

            {/* Apply controls */}
            {hasCategories && (
              <div className="space-y-3 border-t pt-4">
                {/* Team groups opt-in */}
                {draft.team_groups.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="include-teams"
                        checked={includeTeamGroups}
                        onCheckedChange={setIncludeTeamGroups}
                        disabled={applying}
                      />
                      <Label htmlFor="include-teams" className="text-sm">
                        Include team groups (LOW confidence)
                      </Label>
                    </div>
                    {includeTeamGroups && (
                      <div className="ml-6 space-y-1.5">
                        {draft.team_groups.map((tg, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <Checkbox
                              id={`verify-team-${idx}`}
                              checked={verifiedTeamGroups.has(idx)}
                              onCheckedChange={() => toggleTeamGroupVerified(idx)}
                              disabled={applying}
                            />
                            <Label htmlFor={`verify-team-${idx}`} className="text-sm text-muted-foreground">
                              I verified "{tg.name}"
                            </Label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <Button
                  onClick={handleApply}
                  disabled={applying}
                  variant={applyReport ? "outline" : "default"}
                  className="w-full gap-2"
                >
                  {applying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Applying…
                    </>
                  ) : applyReport ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-emerald-600" />
                      Re-apply (safe — add-only, idempotent)
                    </>
                  ) : (
                    "Apply (Add-only)"
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  {applyReport
                    ? "Already applied this session. Re-applying will safely skip existing rows."
                    : "Existing categories and prizes will not be modified or deleted."}
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ErrorCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-4 rounded-lg border p-5 my-4">
      <div className="text-muted-foreground shrink-0">{icon}</div>
      <div>
        <p className="font-medium text-sm">{title}</p>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
