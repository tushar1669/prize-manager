import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { PendingPaymentsPanel } from "@/components/master/PendingPaymentsPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { formatCurrencyINR } from "@/utils/currency";
import {
  NoScreenshotNotice,
  PaymentExtractionEvidence,
  ViewScreenshotButton,
  type ExtractionDetail,
  type ExtractionFlag,
  type ExtractionPayload,
} from "@/components/payments/PaymentEvidence";
import { evidenceRowClass } from "@/components/payments/evidenceStyles";
import { AutoApprovedPanel } from "@/components/payments/AutoApprovedPanel";

interface HistoryRow {
  id: string;
  tournament_id: string;
  user_id: string;
  amount_inr: number;
  utr: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  screenshot_extraction_id: string | null;
  tournament_title?: string;
  user_email?: string;
  extracted_amount_inr: number | null;
  field_flags: ExtractionFlag[];
  /** Full extraction evidence for the detail row; null when the claim carried no screenshot. */
  extraction: ExtractionDetail | null;
  /** 1-based ordinal of this payment within its (tournament_id, user_id) pair. */
  attempt_index: number;
  /** Total payments for that same pair. */
  attempt_total: number;
}

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-success/15 text-success border-success/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  pending: "bg-warning/15 text-warning border-warning/30",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminPayments() {
  const { is_master, authzStatus } = useUserRole();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: history, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-payment-history"],
    queryFn: async (): Promise<HistoryRow[]> => {
      const { data: paymentRows, error: paymentError } = await supabase
        .from("tournament_payments")
        .select(
          "id, tournament_id, user_id, amount_inr, utr, status, created_at, reviewed_at, review_note, screenshot_extraction_id" as never
        )
        .order("created_at", { ascending: false });

      if (paymentError) throw paymentError;
      const rows = (paymentRows ?? []) as unknown as Array<Record<string, unknown>>;
      if (rows.length === 0) return [];

      const tournamentIds = [...new Set(rows.map((p) => p.tournament_id as string))];
      const { data: tournaments } = await supabase
        .from("tournaments")
        .select("id, title")
        .in("id", tournamentIds);
      const titleMap = new Map((tournaments ?? []).map((t) => [t.id, t.title]));

      const userIds = [...new Set(rows.map((p) => p.user_id as string))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", userIds);
      const emailMap = new Map((profiles ?? []).map((p) => [p.id, p.email]));

      const screenshotIds = rows
        .map((p) => p.screenshot_extraction_id as string | null)
        .filter((id): id is string => typeof id === "string");

      const extractionMap = new Map<string, ExtractionDetail>();
      if (screenshotIds.length > 0) {
        const { data: extractionRows } = await supabase
          .from("extractions")
          .select("id, document_id, payload, field_flags, confidence")
          .in("id", screenshotIds);

        // The stored file lives on extraction_documents, not on the extraction —
        // without file_path there is nothing to sign and no screenshot to show.
        const documentIds = [
          ...new Set((extractionRows ?? []).map((r) => r.document_id).filter(Boolean)),
        ];
        const pathMap = new Map<string, string | null>();
        if (documentIds.length > 0) {
          const { data: documentRows } = await supabase
            .from("extraction_documents")
            .select("id, file_path")
            .in("id", documentIds);
          for (const doc of documentRows ?? []) {
            pathMap.set(doc.id, doc.file_path ?? null);
          }
        }

        for (const row of extractionRows ?? []) {
          extractionMap.set(row.id, {
            payload: ((row.payload ?? {}) as unknown) as ExtractionPayload,
            field_flags: (Array.isArray(row.field_flags) ? row.field_flags : []) as ExtractionFlag[],
            confidence: typeof row.confidence === "number" ? row.confidence : 0,
            file_path: pathMap.get(row.document_id) ?? null,
          });
        }
      }

      // Attempt ordinal per (tournament_id, user_id) pair, oldest first. Repeated
      // rejections against one tournament are the fraud signal, so the count has to
      // be visible on every row, not just the latest one.
      const byPair = new Map<string, string[]>();
      const chronological = [...rows].sort(
        (a, b) =>
          new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime()
      );
      for (const p of chronological) {
        const key = `${p.tournament_id as string}:${p.user_id as string}`;
        const list = byPair.get(key) ?? [];
        list.push(p.id as string);
        byPair.set(key, list);
      }

      return rows.map((p) => {
        const key = `${p.tournament_id as string}:${p.user_id as string}`;
        const siblings = byPair.get(key) ?? [];
        const extraction = p.screenshot_extraction_id
          ? extractionMap.get(p.screenshot_extraction_id as string) ?? null
          : null;

        return {
          id: p.id as string,
          tournament_id: p.tournament_id as string,
          user_id: p.user_id as string,
          amount_inr: p.amount_inr as number,
          utr: p.utr as string,
          status: p.status as string,
          created_at: p.created_at as string,
          reviewed_at: (p.reviewed_at as string | null) ?? null,
          review_note: (p.review_note as string | null) ?? null,
          screenshot_extraction_id: (p.screenshot_extraction_id as string | null) ?? null,
          tournament_title: titleMap.get(p.tournament_id as string) ?? undefined,
          user_email: emailMap.get(p.user_id as string) ?? undefined,
          extracted_amount_inr: extraction?.payload.amount_inr ?? null,
          field_flags: extraction?.field_flags ?? [],
          extraction,
          attempt_index: siblings.indexOf(p.id as string) + 1,
          attempt_total: siblings.length,
        };
      });
    },
  });

  // Defense-in-depth second layer behind the /admin requireMaster route guard.
  // Wait for role resolution before denying access.
  if (authzStatus !== 'ready') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!is_master) return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-6">
      <PendingPaymentsPanel />

      {/* F3-C1. Sits above All Payments: these rows were never seen by a human,
          so they are the ones that need looking at first. */}
      <AutoApprovedPanel />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>All Payments</CardTitle>
            <CardDescription>
              Every manual UPI payment claim ever submitted — pending, approved and rejected —
              newest first.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 py-6 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>Failed to load payment history: {(error as Error).message}</span>
            </div>
          ) : !history?.length ? (
            <p className="py-6 text-center text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Tournament</TableHead>
                  <TableHead>Organizer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Claimed</TableHead>
                  <TableHead>On screenshot</TableHead>
                  <TableHead>UTR</TableHead>
                  <TableHead>Screenshot</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Reviewed</TableHead>
                  <TableHead>Attempt</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => {
                  const mismatch =
                    row.extracted_amount_inr != null && row.extracted_amount_inr !== row.amount_inr;
                  const repeated = row.attempt_total > 1;
                  const isOpen = expanded[row.id] ?? false;
                  return (
                    <Fragment key={row.id}>
                    <TableRow>
                      <TableCell className="pr-0 align-top">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          aria-expanded={isOpen}
                          aria-label={isOpen ? "Hide payment evidence" : "Show payment evidence"}
                          onClick={() =>
                            setExpanded((prev) => ({ ...prev, [row.id]: !(prev[row.id] ?? false) }))
                          }
                        >
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {row.tournament_title ?? (
                          <span className="font-mono text-xs text-muted-foreground">
                            {row.tournament_id.slice(0, 8)}…
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.user_email ?? (
                          <span className="font-mono text-xs text-muted-foreground">
                            {row.user_id.slice(0, 8)}…
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={STATUS_STYLES[row.status] ?? "bg-muted text-foreground"}
                        >
                          {row.status}
                        </Badge>
                        {row.review_note && (
                          <p className="mt-0.5 max-w-[16rem] text-[11px] text-foreground/70">
                            {row.review_note}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {formatCurrencyINR(row.amount_inr)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.extracted_amount_inr != null ? (
                          <span
                            className={
                              mismatch ? "font-semibold text-destructive" : "text-foreground"
                            }
                          >
                            {formatCurrencyINR(row.extracted_amount_inr)}
                            {mismatch && (
                              <span className="ml-1 whitespace-nowrap text-[11px] font-bold uppercase">
                                ⚠ mismatch
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-warning">
                            {row.screenshot_extraction_id ? "not read" : "no screenshot"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.utr}</TableCell>
                      {/* Three visibly distinct states — a blank cell here would
                          read as "no evidence" for all of them. */}
                      <TableCell className="text-xs">
                        {row.screenshot_extraction_id == null ? (
                          <NoScreenshotNotice />
                        ) : (
                          <ViewScreenshotButton filePath={row.extraction?.file_path ?? null} />
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-foreground/80">
                        {formatDateTime(row.created_at)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-foreground/80">
                        {formatDateTime(row.reviewed_at)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        <span
                          className={
                            repeated
                              ? "font-semibold text-warning"
                              : "text-foreground/80"
                          }
                        >
                          {row.attempt_index} of {row.attempt_total}
                        </span>
                      </TableCell>
                      <TableCell>
                        {row.field_flags.length === 0 ? (
                          <span className="text-xs text-foreground/60">—</span>
                        ) : (
                          <div className="flex max-w-[18rem] flex-wrap gap-1">
                            {row.field_flags.map((f, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center rounded border border-warning/30 bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium leading-tight text-warning"
                              >
                                {f.field.replace(/_/g, " ")}: {f.reason.replace(/_/g, " ")}
                              </span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      /* Opaque resting background plus a hover: override that repeats
                         it — the base TableRow carries `hover:bg-muted/50`, so a
                         translucent tint would only be legible while hovered. */
                      <TableRow
                        className={
                          row.extraction
                            ? evidenceRowClass(row.field_flags.length > 0)
                            : "bg-muted hover:bg-muted"
                        }
                      >
                        <TableCell
                          colSpan={12}
                          className="border-t border-border px-6 py-2.5 text-foreground"
                        >
                          {row.extraction ? (
                            <PaymentExtractionEvidence
                              extraction={row.extraction}
                              claimedAmountInr={row.amount_inr}
                            />
                          ) : (
                            <div className="flex items-start gap-1.5 text-xs">
                              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
                              <span className="font-medium text-foreground">
                                {row.screenshot_extraction_id
                                  ? "The extraction record for this screenshot could not be read — no extracted fields to show."
                                  : "UTR only — no screenshot was submitted with this claim, so nothing was extracted or verified."}
                              </span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
