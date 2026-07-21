import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl } from "@/lib/storage";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Review screen for a brochure extraction (PRD F7).
 *
 * The form edits a local copy of the payload; Approve persists that copy back to the extraction
 * row and only then calls commit-extraction, which reads the payload from the database. That
 * ordering is what makes "the edited value, not the original, is committed" true by construction
 * rather than by trusting the request body.
 */

type PrizeRow = {
  place?: number | null;
  rank_from?: number | null;
  rank_to?: number | null;
  cash_amount?: number | null;
  has_trophy?: boolean | null;
  has_medal?: boolean | null;
  gift_description?: string | null;
};

type PrizeCategory = {
  name?: string | null;
  is_main?: boolean | null;
  criteria?: Record<string, unknown> | null;
  prizes?: PrizeRow[] | null;
};

type Payload = {
  tournament_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  venue?: string | null;
  city?: string | null;
  state?: string | null;
  event_code?: string | null;
  organizer?: string | null;
  chief_arbiter?: string | null;
  tournament_director?: string | null;
  total_prize_fund?: number | null;
  aicf_rated?: boolean | null;
  fide_rated?: boolean | null;
  prize_categories?: PrizeCategory[] | null;
  [key: string]: unknown;
};

type FieldFlag = { field: string; reason: string; severity: string; expected?: number; stated?: number };

const SUM_TOLERANCE_INR = 100;

function computedCashSum(payload: Payload): number {
  let sum = 0;
  for (const category of payload.prize_categories ?? []) {
    for (const prize of category?.prizes ?? []) {
      const cash = typeof prize?.cash_amount === "number" ? prize.cash_amount : 0;
      const from = prize?.rank_from;
      const to = prize?.rank_to;
      const span = typeof from === "number" && typeof to === "number" && to >= from ? to - from + 1 : 1;
      sum += cash * span;
    }
  }
  return sum;
}

function prizeLabel(prize: PrizeRow): string {
  if (typeof prize.rank_from === "number" && typeof prize.rank_to === "number") {
    return `${prize.rank_from}–${prize.rank_to}`;
  }
  return typeof prize.place === "number" ? String(prize.place) : "?";
}

export default function BrochureReview() {
  const { extractionId } = useParams<{ extractionId: string }>();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Categories the reviewer has explicitly opted out of importing (FIX 4). Keyed by index, which is
  // stable here because this screen never reorders categories.
  const [excludedCategories, setExcludedCategories] = useState<Set<number>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ["brochure-extraction", extractionId],
    enabled: !!extractionId,
    queryFn: async () => {
      const { data: extraction, error: extErr } = await supabase
        .from("extractions")
        .select("id, payload, field_flags, confidence, status, linked_tournament_id, document_id")
        .eq("id", extractionId!)
        .maybeSingle();
      if (extErr) throw extErr;
      if (!extraction) throw new Error("Extraction not found");

      const { data: document, error: docErr } = await supabase
        .from("extraction_documents")
        .select("id, file_name, file_path, mime_type")
        .eq("id", extraction.document_id)
        .maybeSingle();
      if (docErr) throw docErr;
      return { extraction, document };
    },
  });

  useEffect(() => {
    if (data?.extraction && payload === null) {
      setPayload(structuredClone(data.extraction.payload) as Payload);
    }
  }, [data, payload]);

  useEffect(() => {
    if (!data?.document?.file_path) return;
    void getSignedUrl("extraction-uploads", data.document.file_path, 3600).then(({ url }) => setPreviewUrl(url));
  }, [data?.document?.file_path]);

  const flags = useMemo(() => {
    const raw = (data?.extraction?.field_flags ?? []) as FieldFlag[];
    return new Map(raw.map((flag) => [flag.field, flag]));
  }, [data?.extraction?.field_flags]);

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!extractionId || !payload) throw new Error("Nothing to approve");
      // Drop excluded categories entirely (FIX 4): an explicit opt-out, never a silent skip. What
      // remains is what gets committed, so the mapper never has to guess about a nameless row.
      const committedPayload: Payload = {
        ...payload,
        prize_categories: (payload.prize_categories ?? []).filter((_, i) => !excludedCategories.has(i)),
      };
      // Persist edits first so commit-extraction commits exactly what the reviewer saw.
      const { error: updateErr } = await supabase
        .from("extractions")
        .update({ payload: committedPayload, updated_at: new Date().toISOString() })
        .eq("id", extractionId);
      if (updateErr) throw updateErr;

      const { data: result, error: fnError } = await supabase.functions.invoke("commit-extraction", {
        body: { extraction_id: extractionId },
      });
      if (fnError) {
        const context = (fnError as { context?: Response }).context;
        if (context instanceof Response) {
          const body = await context.json().catch(() => null);
          throw new Error(body?.message ?? "Commit failed");
        }
        throw fnError;
      }
      const tournamentId = result?.tournament_id;
      if (typeof tournamentId !== "string") throw new Error("Commit returned no tournament");
      return { tournamentId, warnings: (result?.warnings ?? []) as string[] };
    },
    onSuccess: ({ tournamentId, warnings }) => {
      toast.success("Tournament created from brochure");
      warnings.forEach((warning) => toast.warning(warning));
      navigate(`/t/${tournamentId}/setup?tab=details`);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Commit failed");
    },
  });

  const discardMutation = useMutation({
    mutationFn: async () => {
      if (!extractionId) return;
      const { error: updateErr } = await supabase
        .from("extractions")
        .update({ status: "rejected", updated_at: new Date().toISOString() })
        .eq("id", extractionId);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      toast("Extraction discarded — nothing was created");
      navigate("/dashboard");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Could not discard");
    },
  });

  if (isLoading || !payload) {
    return (
      <div className="min-h-screen bg-background">
        <AppNav />
        <div className="flex items-center justify-center py-24">
          {error ? (
            <p className="text-destructive">{error instanceof Error ? error.message : "Could not load extraction"}</p>
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          )}
        </div>
      </div>
    );
  }

  const alreadyCommitted = !!data?.extraction?.linked_tournament_id;
  const statedFund = typeof payload.total_prize_fund === "number" ? payload.total_prize_fund : null;
  const computedSum = computedCashSum(payload);
  const sumOk = statedFund === null || Math.abs(computedSum - statedFund) <= SUM_TOLERANCE_INR;

  const categories = payload.prize_categories ?? [];
  const isUnnamed = (category: PrizeCategory) =>
    !(typeof category?.name === "string" && category.name.trim().length > 0);
  // Approve is blocked while any category is both nameless and not excluded (FIX 4).
  const blockingCount = categories.filter((c, i) => isUnnamed(c) && !excludedCategories.has(i)).length;
  const approveBlocked = blockingCount > 0;

  const setField = (key: keyof Payload, value: unknown) =>
    setPayload((prev) => (prev ? { ...prev, [key]: value } : prev));

  const setPrize = (categoryIdx: number, prizeIdx: number, patch: Partial<PrizeRow>) =>
    setPayload((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const prize = next.prize_categories?.[categoryIdx]?.prizes?.[prizeIdx];
      if (prize) Object.assign(prize, patch);
      return next;
    });

  const setCategoryName = (categoryIdx: number, name: string) =>
    setPayload((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const category = next.prize_categories?.[categoryIdx];
      if (category) category.name = name;
      return next;
    });

  const toggleExcluded = (categoryIdx: number, excluded: boolean) =>
    setExcludedCategories((prev) => {
      const next = new Set(prev);
      if (excluded) next.add(categoryIdx);
      else next.delete(categoryIdx);
      return next;
    });

  const flagBadge = (field: string) => {
    const flag = flags.get(field);
    if (!flag) return null;
    return (
      <Badge variant="outline" className="ml-2 border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        <AlertTriangle className="mr-1 h-3 w-3" />
        {flag.reason === "ungrounded" ? "not found in document" : flag.reason}
      </Badge>
    );
  };

  const textField = (key: keyof Payload, label: string, type: "text" | "date" = "text") => (
    <div>
      <Label className="text-xs text-muted-foreground">
        {label}
        {flagBadge(String(key))}
      </Label>
      <Input
        type={type}
        value={(payload[key] as string | null) ?? ""}
        onChange={(e) => setField(key, e.target.value || null)}
        className="mt-1"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <div className="container mx-auto px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Review extracted brochure</h1>
            <p className="text-sm text-muted-foreground">
              {data?.document?.file_name} — check the values against the document, edit anything that's wrong, then approve.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => discardMutation.mutate()}
              disabled={discardMutation.isPending || approveMutation.isPending || alreadyCommitted}
            >
              Discard
            </Button>
            <Button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending || alreadyCommitted || approveBlocked}
              className="gap-2"
            >
              {approveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {alreadyCommitted ? "Already committed" : "Approve & create tournament"}
            </Button>
          </div>
        </div>

        {/* Arithmetic cross-check, recomputed live from the edited values. A mismatch is an
            informational note, not an error: the stated fund is committed as-is (QA #9), and the
            organizer may legitimately have a printed total that differs from the itemised rows. */}
        <div
          className={`mb-4 flex items-center gap-3 rounded-lg border p-3 text-sm ${
            sumOk
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-900/20"
              : "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          {sumOk ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Info className="h-4 w-4 text-muted-foreground" />}
          {sumOk ? (
            <span>
              Stated prize fund: <strong>₹{statedFund?.toLocaleString("en-IN") ?? "—"}</strong>
              {" · "}Sum of listed prizes: <strong>₹{computedSum.toLocaleString("en-IN")}</strong>
            </span>
          ) : (
            <span>
              Stated <strong>₹{statedFund?.toLocaleString("en-IN") ?? "—"}</strong>
              {" · "}itemised <strong>₹{computedSum.toLocaleString("en-IN")}</strong>
              {statedFund !== null && (
                <> {" "}(difference ₹{Math.abs(computedSum - statedFund).toLocaleString("en-IN")})</>
              )}
            </span>
          )}
        </div>

        {approveBlocked && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              {blockingCount} categor{blockingCount === 1 ? "y is" : "ies are"} still unnamed. Give each a name or
              tick "Exclude from import" before approving.
            </span>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Document preview */}
          <div className="min-h-[70vh] overflow-hidden rounded-lg border border-border bg-muted/30">
            {previewUrl ? (
              data?.document?.mime_type === "application/pdf" ? (
                <object data={previewUrl} type="application/pdf" className="h-full min-h-[70vh] w-full">
                  <p className="p-4 text-sm text-muted-foreground">
                    Preview unavailable — <a className="underline" href={previewUrl} target="_blank" rel="noreferrer">open the brochure</a>.
                  </p>
                </object>
              ) : (
                <img src={previewUrl} alt="Brochure" className="max-h-[80vh] w-full object-contain" />
              )
            ) : (
              <div className="flex h-full items-center justify-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Editable extracted fields */}
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tournament details</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <div className="col-span-2">{textField("tournament_name", "Title")}</div>
                {textField("start_date", "Start date", "date")}
                {textField("end_date", "End date", "date")}
                <div className="col-span-2">{textField("venue", "Venue")}</div>
                {textField("city", "City")}
                {textField("event_code", "Event code")}
                {textField("chief_arbiter", "Chief arbiter")}
                {textField("tournament_director", "Tournament director")}
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Total prize fund (₹){flagBadge("total_prize_fund")}
                  </Label>
                  <Input
                    type="number"
                    value={payload.total_prize_fund ?? ""}
                    onChange={(e) => setField("total_prize_fund", e.target.value === "" ? null : Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div className="flex items-end gap-4 pb-1">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={payload.fide_rated === true}
                      onCheckedChange={(checked) => setField("fide_rated", checked === true)}
                    />
                    FIDE rated{flagBadge("fide_rated")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={payload.aicf_rated === true}
                      onCheckedChange={(checked) => setField("aicf_rated", checked === true)}
                    />
                    AICF rated{flagBadge("aicf_rated")}
                  </label>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Prize categories ({payload.prize_categories?.length ?? 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="multiple" className="w-full">
                  {categories.map((category, categoryIdx) => {
                    const excluded = excludedCategories.has(categoryIdx);
                    const unnamed = isUnnamed(category);
                    const prizeCount = category?.prizes?.length ?? 0;
                    return (
                    <AccordionItem
                      key={categoryIdx}
                      value={`category-${categoryIdx}`}
                      className={excluded ? "opacity-50" : ""}
                    >
                      {/* Editable category name (FIX 3). Kept a sibling of the trigger, never nested
                          inside it, so typing never toggles the accordion and the markup stays valid. */}
                      <div className="flex flex-wrap items-center gap-2 py-2">
                        <Input
                          value={category?.name ?? ""}
                          placeholder="Category name"
                          disabled={excluded}
                          onChange={(e) => setCategoryName(categoryIdx, e.target.value)}
                          className={`h-8 min-w-[10rem] flex-1 ${
                            unnamed && !excluded ? "border-amber-400 focus-visible:ring-amber-400" : ""
                          }`}
                        />
                        {category?.is_main && <Badge variant="secondary">Main</Badge>}
                        {unnamed && !excluded && (
                          <Badge
                            variant="outline"
                            className="border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                          >
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            Unnamed — give this a name or exclude it from import
                          </Badge>
                        )}
                        <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                          <Checkbox
                            checked={excluded}
                            onCheckedChange={(checked) => toggleExcluded(categoryIdx, checked === true)}
                          />
                          Exclude from import
                        </label>
                      </div>
                      <AccordionTrigger className="py-1 text-xs text-muted-foreground">
                        {prizeCount} prize {prizeCount === 1 ? "row" : "rows"}
                      </AccordionTrigger>
                      <AccordionContent>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-muted-foreground">
                              <th className="pb-1 pr-2 font-normal">Place</th>
                              <th className="pb-1 pr-2 font-normal">Cash (₹)</th>
                              <th className="pb-1 pr-2 font-normal">Trophy</th>
                              <th className="pb-1 pr-2 font-normal">Medal</th>
                              <th className="pb-1 font-normal">Gift</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(category?.prizes ?? []).map((prize, prizeIdx) => {
                              const flagPath = `prize_categories[${categoryIdx}].prizes[${prizeIdx}]`;
                              const rowFlag = [...flags.keys()].find((key) => key.startsWith(flagPath));
                              const cash = typeof prize?.cash_amount === "number" ? prize.cash_amount : 0;
                              const hasGift =
                                typeof prize?.gift_description === "string" &&
                                prize.gift_description.trim().length > 0;
                              // A gift-only row (no cash, no trophy, no medal) must not read as a ₹0
                              // cash prize (FIX 2): tint it and label it.
                              const giftOnly =
                                cash === 0 && prize?.has_trophy !== true && prize?.has_medal !== true && hasGift;
                              const rowClass = rowFlag
                                ? "bg-amber-50 dark:bg-amber-900/20"
                                : giftOnly
                                  ? "bg-sky-50/70 dark:bg-sky-900/20"
                                  : "";
                              return (
                                <tr key={prizeIdx} className={rowClass}>
                                  <td className="py-1 pr-2 whitespace-nowrap">
                                    {prizeLabel(prize)}
                                    {giftOnly && (
                                      <Badge variant="outline" className="ml-1 text-[10px]">
                                        Gift
                                      </Badge>
                                    )}
                                    {rowFlag && flagBadge(rowFlag)}
                                  </td>
                                  <td className="py-1 pr-2">
                                    <Input
                                      type="number"
                                      className="h-8 w-24"
                                      value={prize?.cash_amount ?? ""}
                                      onChange={(e) =>
                                        setPrize(categoryIdx, prizeIdx, {
                                          cash_amount: e.target.value === "" ? null : Number(e.target.value),
                                        })
                                      }
                                    />
                                  </td>
                                  <td className="py-1 pr-2">
                                    <Checkbox
                                      checked={prize?.has_trophy === true}
                                      onCheckedChange={(checked) =>
                                        setPrize(categoryIdx, prizeIdx, { has_trophy: checked === true })
                                      }
                                    />
                                  </td>
                                  <td className="py-1 pr-2">
                                    <Checkbox
                                      checked={prize?.has_medal === true}
                                      onCheckedChange={(checked) =>
                                        setPrize(categoryIdx, prizeIdx, { has_medal: checked === true })
                                      }
                                    />
                                  </td>
                                  <td className="py-1">
                                    <Input
                                      type="text"
                                      className="h-8 w-36"
                                      placeholder="—"
                                      value={prize?.gift_description ?? ""}
                                      onChange={(e) =>
                                        setPrize(categoryIdx, prizeIdx, {
                                          gift_description: e.target.value || null,
                                        })
                                      }
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </AccordionContent>
                    </AccordionItem>
                    );
                  })}
                </Accordion>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
