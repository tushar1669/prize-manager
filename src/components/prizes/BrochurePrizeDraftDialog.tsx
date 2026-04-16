import { useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CheckCircle, Copy, ChevronDown, ChevronRight, FileWarning, ImageOff, ScanSearch, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { applyDraftAddOnly, ApplyReport, DraftResult } from "@/utils/prizeApplyDraft";

/** Map raw machine warning keys to human-friendly copy */
const WARNING_COPY: Record<string, string> = {
  no_prize_structure_detected:
    "We couldn't find a recognizable prize structure in this brochure. Try a clearer brochure, or add prizes manually.",
};

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
    [onOpenChange],
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
      if (report.categories_reused > 0) parts.push(`${report.categories_reused} categories reused`);
      if (report.prizes_created > 0) parts.push(`${report.prizes_created} prizes created`);
      if (report.prizes_skipped_existing > 0) parts.push(`${report.prizes_skipped_existing} prizes skipped (existing)`);
      if (report.prizes_skipped_duplicate_in_draft > 0) parts.push(`${report.prizes_skipped_duplicate_in_draft} prizes skipped (duplicate in draft)`);
      if (report.team_groups_created > 0) parts.push(`${report.team_groups_created} team groups created`);
      if (report.team_groups_reused > 0) parts.push(`${report.team_groups_reused} team groups reused`);
      if (report.team_prizes_created > 0) parts.push(`${report.team_prizes_created} team prizes created`);
      if (report.team_prizes_skipped > 0) parts.push(`${report.team_prizes_skipped} team prizes skipped`);
      if (report.failed_categories.length > 0) parts.push(`${report.failed_categories.length} categories failed`);
      if (report.failed_team_groups.length > 0) parts.push(`${report.failed_team_groups.length} team groups failed`);

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
            Best-effort extraction from brochure — always review before applying
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
            description="Image files can't be parsed automatically. Upload a text-based PDF, use Import from Template, or copy prizes from a previous tournament."
          />
        )}

        {status === "scanned_or_image_only" && (
          <ErrorCard
            icon={<ScanSearch className="h-6 w-6" />}
            title="Scanned / image-only PDF"
            description="This PDF contains only scanned images with no extractable text. Upload a text-based PDF, use Import from Template, or copy from a previous tournament."
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
                  Prizes: {applyReport.prizes_created} created, {applyReport.prizes_skipped_existing} skipped existing, {applyReport.prizes_skipped_duplicate_in_draft} skipped duplicate in draft.
                  {(applyReport.team_groups_created > 0 || applyReport.team_prizes_created > 0) && (
                    <> Team: {applyReport.team_groups_created} groups created, {applyReport.team_groups_reused} reused, {applyReport.team_prizes_created} prizes created, {applyReport.team_prizes_skipped} skipped.</>
                  )}
                  {(applyReport.failed_categories.length > 0 || applyReport.failed_team_groups.length > 0) && (
                    <> Failed: {applyReport.failed_categories.length} categories, {applyReport.failed_team_groups.length} team groups.</>
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
              <span className="text-muted-foreground">·</span>
              <span>Confidence: {confidenceBadge(draft.overall_confidence)}</span>
              {response?.selected_event && (
                <Badge variant="secondary">{response.selected_event}</Badge>
              )}
              {/* Pick Different Event — only when multi-event was originally detected */}
              {events.length > 1 && response?.selected_event && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => {
                    setStatus("multi_event_detected");
                    setResponse(null);
                    setApplyReport(null);
                    setExpandedCategories(new Set());
                    setIncludeTeamGroups(false);
                    setVerifiedTeamGroups(new Set());
                  }}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Pick Different Event
                </Button>
              )}
            </div>

            {/* Warnings */}
            {draft.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3 space-y-1.5">
                {draft.warnings.map((w, i) => (
                  <p key={i} className="text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    {WARNING_COPY[w] ?? w}
                  </p>
                ))}
              </div>
            )}

            {/* Empty draft fallback callout */}
            {!hasCategories && (
              <div className="rounded-lg border border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30 p-3">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  You can also import prizes using the Excel template or copy from a previous tournament.
                </p>
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
            {hasCategories && totalPrizes > 0 && (
              <div className="space-y-3 border-t pt-4">
                {/* Low confidence warning */}
                {draft.overall_confidence === "LOW" && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3">
                    <p className="text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      Low confidence extraction — carefully verify each category and prize amount before applying.
                    </p>
                  </div>
                )}
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
