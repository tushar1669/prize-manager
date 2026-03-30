import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CheckCircle, Copy, ChevronDown, ChevronRight, FileWarning, ImageOff, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface BrochurePrizeDraftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: string;
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
}: BrochurePrizeDraftDialogProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [expandedJson, setExpandedJson] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());

  const callFunction = useCallback(
    async (selectedEvent?: string | null) => {
      setStatus("loading");
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

  const handleOpen = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && status === "idle") {
        callFunction();
      }
      if (!nextOpen) {
        setStatus("idle");
        setResponse(null);
        setEvents([]);
        setExpandedJson(false);
        setExpandedCategories(new Set());
      }
      onOpenChange(nextOpen);
    },
    [callFunction, onOpenChange, status],
  );

  const handleCopyJson = () => {
    if (response?.draft) {
      navigator.clipboard.writeText(JSON.stringify(response.draft, null, 2));
      toast.success("Draft JSON copied to clipboard");
    }
  };

  const toggleCategory = (idx: number) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const draft = response?.draft;
  const totalPrizes = draft
    ? draft.categories.reduce((s, c) => s + c.prizes.length, 0) + draft.team_groups.reduce((s, t) => s + t.prizes.length, 0)
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Draft Prize Structure</DialogTitle>
          <DialogDescription>
            Auto-generated from brochure PDF — read-only preview
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

        {/* ok_draft — summary + collapsible detail */}
        {status === "ok_draft" && draft && (
          <div className="space-y-4">
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
