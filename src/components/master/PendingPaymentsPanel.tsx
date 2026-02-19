import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, RefreshCw, CreditCard } from "lucide-react";
import { normalizeError, toastMessage } from "@/lib/errors/normalizeError";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";

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
        .select("id, tournament_id, user_id, amount_inr, utr, status, created_at, review_note")
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

      return paymentRows.map((p) => ({
        ...p,
        tournament_title: titleMap.get(p.tournament_id) ?? undefined,
        user_email: emailMap.get(p.user_id) ?? undefined,
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
              {payments.map((p) => (
                <TableRow key={p.id}>
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
                  <TableCell className="font-mono text-xs">{p.utr}</TableCell>
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
              ))}
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
