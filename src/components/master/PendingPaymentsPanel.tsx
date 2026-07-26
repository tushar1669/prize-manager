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

interface ExtractionPayload {
  amount_inr?: number | null;
  utr?: string | null;
  txn_date?: string | null;
  payee_vpa?: string | null;
  payer_name?: string | null;
  status_text?: string | null;
  app?: string | null;
}

interface ExtractionFlag {
  field: string;
  reason: string;
  severity: string;
  expected?: number;
  stated?: number;
}

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
  extraction?: {
    payload: ExtractionPayload;
    field_flags: ExtractionFlag[];
    confidence: number;
  } | null;
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

      const extractionMap = new Map<string, {
        payload: ExtractionPayload;
        field_flags: ExtractionFlag[];
        confidence: number;
      }>();

      if (screenshotIds.length > 0) {
        const { data: extractionRows } = await supabase
          .from("extractions")
          .select("id, payload, field_flags, confidence")
          .in("id", screenshotIds);

        for (const row of (extractionRows ?? [])) {
          extractionMap.set(row.id, {
            payload: ((row.payload ?? {}) as unknown) as ExtractionPayload,
            field_flags: (Array.isArray(row.field_flags)
              ? row.field_flags
              : []) as ExtractionFlag[],
            confidence: typeof row.confidence === "number" ? row.confidence : 0,
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
              <Badge variant="outline" className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700">
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
                <TableHead>Amount</TableHead>
                <TableHead>UTR</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => {
                const extractionFlags = p.extraction?.field_flags ?? [];
                const hasFlags = extractionFlags.length > 0;
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
                      <TableCell className="text-sm">₹{p.amount_inr}</TableCell>
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
                              className="gap-1 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-900/30"
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
                      <TableRow
                        className={
                          hasFlags
                            ? "bg-amber-50/60 dark:bg-amber-950/20"
                            : "bg-emerald-50/60 dark:bg-emerald-950/20"
                        }
                      >
                        <TableCell colSpan={6} className="py-2 px-6 border-t border-muted/30">
                          <div className="space-y-1.5 text-xs">
                            <div className="flex items-center gap-1.5 font-medium">
                              {hasFlags ? (
                                <>
                                  <AlertCircle className="h-3 w-3 text-amber-600 shrink-0" />
                                  <span className="text-amber-700 dark:text-amber-400">
                                    {extractionFlags.length} flag
                                    {extractionFlags.length !== 1 ? "s" : ""} — review before approving
                                  </span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                                  <span className="text-emerald-700 dark:text-emerald-400">
                                    Screenshot verified · {p.extraction.confidence}% confidence
                                  </span>
                                </>
                              )}
                            </div>

                            <div className="grid grid-cols-3 gap-x-6 gap-y-0.5">
                              {(
                                [
                                  { label: "Amount", value: p.extraction.payload.amount_inr != null ? `₹${p.extraction.payload.amount_inr}` : null, flagField: "amount_inr" },
                                  { label: "UTR", value: p.extraction.payload.utr ?? null, flagField: "utr" },
                                  { label: "Date", value: p.extraction.payload.txn_date ?? null, flagField: "txn_date" },
                                  { label: "Payee", value: p.extraction.payload.payee_vpa ?? null, flagField: "payee_vpa" },
                                  { label: "App", value: p.extraction.payload.app ?? null, flagField: "app" },
                                  { label: "Status", value: p.extraction.payload.status_text ?? null, flagField: "status_text" },
                                ] as Array<{ label: string; value: string | null; flagField: string }>
                              ).map(({ label, value, flagField }) => {
                                const flagged = extractionFlags.some((f) => f.field === flagField);
                                return (
                                  <div key={label} className="flex items-baseline gap-1 min-w-0">
                                    {value != null && !flagged && (
                                      <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500 shrink-0 mt-px" />
                                    )}
                                    {flagged && (
                                      <AlertCircle className="h-2.5 w-2.5 text-amber-500 shrink-0 mt-px" />
                                    )}
                                    {value == null && !flagged && (
                                      <span className="inline-block w-2.5 shrink-0" />
                                    )}
                                    <span className="text-muted-foreground shrink-0">{label}:</span>
                                    <span
                                      className={[
                                        "truncate",
                                        flagged ? "text-amber-700 dark:text-amber-400 font-medium" : "",
                                        value == null ? "text-muted-foreground/50" : "",
                                      ]
                                        .filter(Boolean)
                                        .join(" ")}
                                    >
                                      {value ?? "—"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            {extractionFlags.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {extractionFlags.map((f, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px] leading-tight"
                                  >
                                    {f.field.replace(/_/g, " ")}: {f.reason.replace(/_/g, " ")}
                                    {f.reason === "amount_mismatch" &&
                                    f.expected != null &&
                                    f.stated != null
                                      ? ` (expected ₹${f.expected}, got ₹${f.stated})`
                                      : ""}
                                    {f.reason === "date_stale" ? " (too old)" : ""}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
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
