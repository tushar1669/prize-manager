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
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
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

function criteriaSummary(criteria: Record<string, unknown> | null | undefined): string {
  if (!criteria) return "Open";
  const parts: string[] = [];
  if (criteria.city) parts.push(`City: ${criteria.city}`);
  if (criteria.state) parts.push(`State: ${criteria.state}`);
  if (typeof criteria.age_max === "number") parts.push(`Under ${criteria.age_max}`);
  if (typeof criteria.age_min === "number") parts.push(`${criteria.age_min}+`);
  if (typeof criteria.rating_min === "number" || typeof criteria.rating_max === "number") {
    parts.push(`Rating ${criteria.rating_min ?? "…"}–${criteria.rating_max ?? "…"}`);
  }
  if (criteria.gender && criteria.gender !== "any") parts.push(String(criteria.gender));
  return parts.length > 0 ? parts.join(" · ") : "Open";
}

export default function BrochureReview() {
  const { extractionId } = useParams<{ extractionId: string }>();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
      // Persist edits first so commit-extraction commits exactly what the reviewer saw.
      const { error: updateErr } = await supabase
        .from("extractions")
        .update({ payload, updated_at: new Date().toISOString() })
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
              disabled={approveMutation.isPending || alreadyCommitted}
              className="gap-2"
            >
              {approveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {alreadyCommitted ? "Already committed" : "Approve & create tournament"}
            </Button>
          </div>
        </div>

        {/* Arithmetic cross-check, recomputed live from the edited values */}
        <div
          className={`mb-4 flex items-center gap-3 rounded-lg border p-3 text-sm ${
            sumOk
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-900/20"
              : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
          }`}
        >
          {sumOk ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
          <span>
            Stated prize fund: <strong>₹{statedFund?.toLocaleString("en-IN") ?? "—"}</strong>
            {" · "}Sum of listed prizes: <strong>₹{computedSum.toLocaleString("en-IN")}</strong>
            {!sumOk && " — these don't match; please check the prize amounts before approving."}
          </span>
        </div>

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
                  {(payload.prize_categories ?? []).map((category, categoryIdx) => (
                    <AccordionItem key={categoryIdx} value={`category-${categoryIdx}`}>
                      <AccordionTrigger className="text-sm">
                        <span className="flex items-center gap-2">
                          {category?.name ?? "Unnamed"}
                          {category?.is_main && <Badge variant="secondary">Main</Badge>}
                          <span className="text-xs font-normal text-muted-foreground">
                            {criteriaSummary(category?.criteria)}
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-muted-foreground">
                              <th className="pb-1 pr-2 font-normal">Place</th>
                              <th className="pb-1 pr-2 font-normal">Cash (₹)</th>
                              <th className="pb-1 pr-2 font-normal">Trophy</th>
                              <th className="pb-1 font-normal">Medal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(category?.prizes ?? []).map((prize, prizeIdx) => {
                              const flagPath = `prize_categories[${categoryIdx}].prizes[${prizeIdx}]`;
                              const rowFlag = [...flags.keys()].find((key) => key.startsWith(flagPath));
                              return (
                                <tr key={prizeIdx} className={rowFlag ? "bg-amber-50 dark:bg-amber-900/20" : ""}>
                                  <td className="py-1 pr-2 whitespace-nowrap">
                                    {prizeLabel(prize)}
                                    {rowFlag && flagBadge(rowFlag)}
                                  </td>
                                  <td className="py-1 pr-2">
                                    <Input
                                      type="number"
                                      className="h-8 w-28"
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
                                  <td className="py-1">
                                    <Checkbox
                                      checked={prize?.has_medal === true}
                                      onCheckedChange={(checked) =>
                                        setPrize(categoryIdx, prizeIdx, { has_medal: checked === true })
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
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
