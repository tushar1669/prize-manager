import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, RefreshCw, CreditCard, AlertCircle } from "lucide-react";
import { normalizeError, toastMessage } from "@/lib/errors/normalizeError";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";
import { formatCurrencyINR } from "@/utils/currency";
import {
  PaymentExtractionEvidence,
  type ExtractionDetail,
  type ExtractionFlag,
  type ExtractionPayload,
} from "@/components/payments/PaymentEvidence";
import { evidenceRowClass } from "@/components/payments/evidenceStyles";

interface PaymentRow {
  id: string;
  tournament_id: string;
  user_id: string;
  amount_inr: number;
  utr: string;
  status: string;
  created_at: string;
  review_note: string | null;
  tournament_title?: string;
  user_email?: string;
  screenshot_extraction_id?: string | null;
  extraction?: ExtractionDetail | null;
}

export function PendingPaymentsPanel() {
  const queryClient = useQueryClient();
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});

  const { data: payments, isLoading, refetch } = useQuery({
    queryKey: ["master-pending-payments"],
    queryFn: async () => {
      // Fetch pending payments
      const { data: paymentRows, error } = await supabase
        .from("tournament_payments")
        .select(
          "id, tournament_id, user_id, amount_inr, utr, status, created_at, review_note, screenshot_extraction_id" as never
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!paymentRows || paymentRows.length === 0) return [];

      // Enrich with tournament titles
      const tournamentIds = [...new Set(paymentRows.map((p) => p.tournament_id))];
      const { data: tournaments } = await supabase
        .from("tournaments")
        .select("id, title")
        .in("id", tournamentIds);
      const titleMap = new Map((tournaments ?? []).map((t) => [t.id, t.title]));

      // Enrich with user emails
      const userIds = [...new Set(paymentRows.map((p) => p.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", userIds);
      const emailMap = new Map((profiles ?? []).map((p) => [p.id, p.email]));

      // Phase 2A: batch-fetch extraction evidence for screenshot-backed payments
      const screenshotIds = (paymentRows as Array<Record<string, unknown>>)
        .map((p) => p.screenshot_extraction_id as string | null)
        .filter((id): id is string => typeof id === "string");

      const extractionMap = new Map<string, ExtractionDetail>();

      if (screenshotIds.length > 0) {
        const { data: extractionRows } = await supabase
          .from("extractions")
          .select("id, document_id, payload, field_flags, confidence")
          .in("id", screenshotIds);

        // The stored file lives on extraction_documents; without file_path there is
        // nothing to sign, which is why the screenshot was never viewable.
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

        for (const row of (extractionRows ?? [])) {
          extractionMap.set(row.id, {
            payload: ((row.payload ?? {}) as unknown) as ExtractionPayload,
            field_flags: (Array.isArray(row.field_flags)
              ? row.field_flags
              : []) as ExtractionFlag[],
            confidence: typeof row.confidence === "number" ? row.confidence : 0,
            file_path: pathMap.get(row.document_id) ?? null,
          });
        }
      }

      return (paymentRows as Array<Record<string, unknown>>).map((p) => ({
        ...p,
        tournament_title: titleMap.get(p.tournament_id as string) ?? undefined,
        user_email: emailMap.get(p.user_id as string) ?? undefined,
        extraction: p.screenshot_extraction_id
          ? (extractionMap.get(p.screenshot_extraction_id as string) ?? null)
          : null,
      })) as PaymentRow[];
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ paymentId, decision, note }: { paymentId: string; decision: string; note?: string }) => {
      const { data, error } = await supabase.rpc("review_tournament_payment" as never, {
        p_payment_id: paymentId,
        p_decision: decision,
        p_note: note ?? null,
      } as never);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_data, variables) => {
      const action = variables.decision === "approve" ? "approved" : "rejected";
      toast.success(`Payment ${action} successfully.`);
      queryClient.invalidateQueries({ queryKey: ["master-pending-payments"] });
    },
    onError: (error) => {
      const normalized = normalizeError(error);
      toast.error(toastMessage(normalized));
      logAuditEvent({
        eventType: "payment_review_error",
        message: error instanceof Error ? error.message : String(error),
        friendlyMessage: normalized.friendlyMessage,
        referenceId: normalized.referenceId,
      });
    },
  });

  const pendingCount = payments?.length ?? 0;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <CardTitle>Payment Approvals</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">
                {pendingCount} pending
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading} title="Refresh">
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        <CardDescription>Review and approve manual UPI payment claims</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-4 flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : payments && payments.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tournament</TableHead>
                <TableHead>Organizer</TableHead>
                <TableHead>Amount (claimed vs screenshot)</TableHead>
                <TableHead>UTR</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => {
                const extractionFlags = p.extraction?.field_flags ?? [];
                const hasFlags = extractionFlags.length > 0;
                const extractedAmount = p.extraction?.payload.amount_inr ?? null;
                const amountMismatch = extractedAmount != null && extractedAmount !== p.amount_inr;
                return (
                  <Fragment key={p.id}>
                    <TableRow>
                      <TableCell className="font-medium text-sm">
                        {p.tournament_title ?? (
                          <span className="font-mono text-xs text-muted-foreground">{p.tournament_id.slice(0, 8)}…</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.user_email ?? (
                          <span className="font-mono text-xs text-muted-foreground">{p.user_id.slice(0, 8)}…</span>
                        )}
                      </TableCell>
                      {/* Claimed and extracted amounts sit adjacent — a bare "Amount"
                          column is ambiguous about which number was actually paid. */}
                      <TableCell className="text-sm">
                        <div className="flex flex-col gap-0.5 leading-tight">
                          <span className="font-medium text-foreground">
                            {formatCurrencyINR(p.amount_inr)} <span className="font-normal">claimed</span>
                          </span>
                          {extractedAmount != null ? (
                            <span
                              className={
                                amountMismatch
                                  ? "font-semibold text-destructive"
                                  : "text-foreground/80"
                              }
                            >
                              {formatCurrencyINR(extractedAmount)}{" "}
                              <span className="font-normal">on screenshot</span>
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-warning">
                              no amount read from screenshot
                            </span>
                          )}
                          {amountMismatch && (
                            <span className="inline-flex items-center gap-1 rounded bg-destructive/15 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-destructive">
                              <AlertCircle className="h-3 w-3 shrink-0" />
                              Mismatch
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {p.utr}
                        {!p.screenshot_extraction_id && (
                          <p className="font-sans text-muted-foreground text-[10px] mt-0.5 tracking-normal">
                            Manual check required
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-success border-success/30 hover:bg-success/10"
                              onClick={() => reviewMutation.mutate({ paymentId: p.id, decision: "approve" })}
                              disabled={reviewMutation.isPending}
                            >
                              {reviewMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() =>
                                reviewMutation.mutate({
                                  paymentId: p.id,
                                  decision: "reject",
                                  note: rejectNotes[p.id] || undefined,
                                })
                              }
                              disabled={reviewMutation.isPending}
                            >
                              {reviewMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5" />
                              )}
                              Reject
                            </Button>
                          </div>
                          <Input
                            placeholder="Rejection note (optional)"
                            className="h-7 text-xs w-48"
                            value={rejectNotes[p.id] ?? ""}
                            onChange={(e) => setRejectNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                    {p.extraction && (
                      /* Opaque background + a hover: override that repeats it. The base
                         TableRow class carries `hover:bg-muted/50`, so a translucent
                         resting tint made this block only legible while hovered. */
                      <TableRow className={evidenceRowClass(hasFlags)}>
                        <TableCell colSpan={6} className="py-2.5 px-6 border-t border-border text-foreground">
                          <PaymentExtractionEvidence
                            extraction={p.extraction}
                            claimedAmountInr={p.amount_inr}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="py-6 text-center text-muted-foreground">
            <CreditCard className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No pending payments</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
