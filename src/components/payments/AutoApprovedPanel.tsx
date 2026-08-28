import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NoScreenshotNotice, ViewScreenshotButton } from "@/components/payments/PaymentEvidence";
import { useUserRole } from "@/hooks/useUserRole";
import { formatCurrencyINR } from "@/utils/currency";
import {
  listAutoApprovals,
  recordAutoApprovalAudit,
  revokeAutoEntitlement,
  type AuditAction,
  type AuditOutcome,
  type AutoApprovalRow,
  type RevokeResult,
  type Verdict,
  type VerdictName,
} from "@/integrations/supabase/autoApprovals";

/**
 * F3-C1 — the auto-approved section of /admin/payments.
 *
 * These are the payments F2 let through without a human ever looking at them.
 * The section exists so a master can go back and check whether the invariant
 * checker was right, record that judgement, and pull the entitlement when it
 * was not.
 *
 * Three rules this file is built around:
 *
 *  1. Identity comes from the entitlement (source='auto_upi'), which is what
 *     list_auto_approvals() keys on. It is NEVER "reviewed_by IS NULL" —
 *     revoking stamps reviewed_by, so such a filter would make revoked rows
 *     disappear from the very list used to audit them. Guardrail X1.
 *
 *  2. No optimistic updates, anywhere. Entitlements stack: a coupon or a manual
 *     grant can keep Pro alive after the auto entitlement is ended. Whether
 *     access actually went away is only knowable from the server, so every
 *     write is followed by a re-fetch and the revoke outcome is rendered from
 *     the RPC's own response. Guardrail X4.
 *
 *  3. Never blank space. Loading, empty, and error are all explicit; a silent
 *     empty panel on an audit surface reads as "nothing to see here", which is
 *     the one thing it must never say by accident.
 */

/** The eight invariants F2's checker records, in the order they are read. */
const VERDICT_NAMES: readonly VerdictName[] = [
  "utr_format",
  "utr_duplicate",
  "amount_mismatch",
  "payee_vpa_mismatch",
  "payee_vpa_missing",
  "date_stale",
  "direction_not_outgoing",
  "required_fields_missing",
] as const;

/** The checker version this panel's reading of the verdicts was written against. */
const EXPECTED_CHECKER_VERSION = 1;

const CHIP_BASE =
  "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-tight";

/**
 * `skipped` is a caution, not a neutral: the invariant did not run, so it
 * proves nothing about the payment. Same reasoning as the null payee_vpa
 * treatment in PaymentEvidence.
 */
const VERDICT_CHIP: Record<Verdict, string> = {
  pass: "bg-success/15 text-success border-success/30",
  fail: "bg-destructive/15 text-destructive border-destructive/30",
  skipped: "bg-warning/15 text-warning border-warning/30",
};

const AUDIT_OUTCOME_CHIP: Record<AuditOutcome, string> = {
  ok: "bg-success/15 text-success border-success/30",
  loophole: "bg-destructive/15 text-destructive border-destructive/30",
  uncertain: "bg-warning/15 text-warning border-warning/30",
};

const OUTCOME_OPTIONS: ReadonlyArray<{ value: AuditOutcome; label: string }> = [
  { value: "ok", label: "ok — the auto-approval was correct" },
  { value: "loophole", label: "loophole — it should not have passed" },
  { value: "uncertain", label: "uncertain — needs more evidence" },
];

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

function humanLabel(name: string): string {
  return name.replace(/_/g, " ");
}

/** 'not_master' and friends arrive as bare tokens; say what they mean. */
function explainError(message: string): string {
  if (message === "not_master") return "not_master — this account is not a verified master.";
  if (message === "reason_required") return "reason_required — the server rejected a blank reason.";
  if (message === "not_an_auto_approval") {
    return "not_an_auto_approval — this payment has no auto_upi entitlement to revoke.";
  }
  if (message === "invalid_outcome") return "invalid_outcome — the outcome must be ok, loophole or uncertain.";
  if (message === "invalid_action_taken") {
    return "invalid_action_taken — the action must be none or entitlement_revoked.";
  }
  if (message === "payment_not_found") return "payment_not_found — the payment row no longer exists.";
  return message;
}

function errorText(error: unknown): string {
  return explainError(error instanceof Error ? error.message : String(error));
}

/**
 * A revoke response plus the wall-clock time it landed.
 *
 * The time is what lets the block below be honest without being cleared: it is
 * stamped as a record of an event, so it cannot contradict the live "Pro
 * access now:" chip sitting above it.
 */
type RevokeRecord = { result: RevokeResult; at: string };

/**
 * The sentence rendered after a revoke returns.
 *
 * Written from the RESPONSE, never from an assumption about what revoking
 * does. If Pro is still active this must say so and name the sources that are
 * keeping it alive — telling a master that access was removed when it was not
 * is the failure this whole section exists to prevent.
 */
function revokeOutcomeMessage(result: RevokeResult): { tone: "warning" | "success"; text: string } {
  const ended =
    result.entitlements_ended === 1
      ? "1 auto entitlement was ended"
      : `${result.entitlements_ended} auto entitlements were ended`;

  if (result.pro_still_active) {
    const sources =
      result.active_sources.length > 0
        ? result.active_sources.join(", ")
        : "an entitlement this response did not name";
    return {
      tone: "warning",
      text:
        `${ended}, but Pro is still active for this organizer on this tournament — ` +
        `kept alive by: ${sources}. Access was NOT removed.`,
    };
  }

  return {
    tone: "success",
    text: `${ended}. No entitlement is active for this organizer on this tournament any more.`,
  };
}

export function AutoApprovedPanel() {
  const { is_master, authzStatus } = useUserRole();
  const queryClient = useQueryClient();

  // "" is a real state, not a missing one: an un-audited row starts with NO
  // outcome chosen. See the draft-outcome default below for why.
  const [outcomeDraft, setOutcomeDraft] = useState<Record<string, AuditOutcome | "">>({});
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});
  const [revokeTarget, setRevokeTarget] = useState<AutoApprovalRow | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  // Kept for the whole session, deliberately. The message below is a record of
  // an event, not a claim about the present, so a fresh row cannot make it
  // stale. Dropping it on refetch would make the X4 warning — "Access was NOT
  // removed / kept alive by: coupon", the most important sentence in this
  // panel — flash and vanish at production refetch speed while the toast is
  // still pointing at it. The live "Pro access now:" chip is the current-state
  // answer; this is the historical one, and both are labelled as such.
  const [revokeResults, setRevokeResults] = useState<Record<string, RevokeRecord>>({});

  const {
    data: rows,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["admin-auto-approvals"],
    queryFn: listAutoApprovals,
    enabled: authzStatus === "ready" && is_master,
    // 'not_master' and a missing RPC are permanent: retrying burns requests and
    // hides the message behind three spinners. The Retry button is the only
    // retry path, and it is the master's decision.
    retry: false,
    refetchOnWindowFocus: false,
  });

  const auditMutation = useMutation({
    mutationFn: ({
      paymentId,
      outcome,
      reason,
      actionTaken,
    }: {
      paymentId: string;
      outcome: AuditOutcome;
      reason: string;
      actionTaken: AuditAction;
    }) => recordAutoApprovalAudit(paymentId, outcome, reason, actionTaken),
    onSuccess: (_data, variables) => {
      toast.success("Audit recorded.");
      setReasonDraft((prev) => ({ ...prev, [variables.paymentId]: "" }));
      // Re-fetch rather than patch the row: audited_at and audited_by are
      // assigned by the server and the row may already carry an earlier audit.
      queryClient.invalidateQueries({ queryKey: ["admin-auto-approvals"] });
    },
    onError: (mutationError) => {
      toast.error(`Audit not recorded: ${errorText(mutationError)}`);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      revokeAutoEntitlement(paymentId, reason),
    onSuccess: (result, variables) => {
      // The wall-clock time the response landed, captured here and never
      // recomputed, so the block can date itself instead of pretending to
      // describe the present.
      setRevokeResults((prev) => ({
        ...prev,
        [variables.paymentId]: { result, at: new Date().toISOString() },
      }));
      setRevokeTarget(null);
      setRevokeReason("");
      toast.success("Entitlement revoked. Read the result on the row.");
      // Re-read the row so the live chip above the message shows the server's
      // own pro_still_active and active_sources. The stored result is NOT
      // dropped when that lands: it is a timestamped record of what the RPC
      // said, which stays true no matter what the row says later.
      void queryClient.invalidateQueries({ queryKey: ["admin-auto-approvals"] });
    },
    onError: (mutationError) => {
      toast.error(`Revoke failed: ${errorText(mutationError)}`);
    },
  });

  // Defence in depth behind the /admin route guard. Role resolution has to
  // settle before the master check runs, otherwise a slow user_roles read
  // renders this as "not a master" for a moment.
  if (authzStatus !== "ready") {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Auto-approved payments</CardTitle>
          <CardDescription>Checking your access…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!is_master) return null;

  const total = rows?.length ?? 0;
  const unaudited = (rows ?? []).filter((row) => row.audit === null).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>Auto-approved payments</CardTitle>
            <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-border">
              {total} total
            </Badge>
            <Badge
              variant="outline"
              className={
                unaudited > 0
                  ? "bg-warning/15 text-warning border-warning/30"
                  : "bg-success/15 text-success border-success/30"
              }
            >
              {unaudited} un-audited
            </Badge>
          </div>
          <CardDescription className="mt-1">
            Payments F2 approved without human review, identified by the auto_upi entitlement they
            created. Check the invariant verdicts against the evidence, record what you found, and
            revoke the entitlement if it should not have passed.
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
          <div className="flex items-start gap-2 rounded border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-px h-4 w-4 shrink-0" />
            <div className="space-y-1.5">
              <p className="font-semibold">Could not load auto-approved payments.</p>
              <p className="font-mono text-xs break-all">{errorText(error)}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`mr-1 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                Retry
              </Button>
            </div>
          </div>
        ) : total === 0 ? (
          <p className="py-8 text-center text-muted-foreground">No auto-approvals yet</p>
        ) : (
          <div className="space-y-4">
            {(rows ?? []).map((row) => {
              const checkerMismatch = row.checker_version !== EXPECTED_CHECKER_VERSION;
              const countUnexpected = row.auto_entitlement_count !== 1;
              const draftReason = reasonDraft[row.payment_id] ?? "";
              // No default outcome on an un-audited row. "ok" is the verdict that
              // closes the case, and Record audit unlocks on the reason alone —
              // so defaulting to it would let an untouched select record "ok" for
              // a payment nobody actually judged. An existing audit IS a real
              // prior judgement, so that one is kept as the starting value.
              const draftOutcome: AuditOutcome | "" =
                outcomeDraft[row.payment_id] ?? row.audit?.outcome ?? "";
              const reasonBlank = draftReason.trim().length === 0;
              const outcomeMissing = draftOutcome === "";
              const savingAudit =
                auditMutation.isPending && auditMutation.variables?.paymentId === row.payment_id;
              const revokeRecord = revokeResults[row.payment_id] ?? null;
              const revokeResult = revokeRecord?.result ?? null;
              const outcomeMessage = revokeResult ? revokeOutcomeMessage(revokeResult) : null;

              return (
                <div
                  key={row.payment_id}
                  className="space-y-3 rounded-lg border border-border bg-card p-4"
                >
                  {/* ---- identity ---- */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <Link
                        to={`/t/${row.tournament_id}/setup?tab=details`}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-foreground underline underline-offset-2"
                      >
                        {row.tournament_title ?? `Tournament ${row.tournament_id.slice(0, 8)}…`}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </Link>
                      <p className="text-xs text-foreground/80">
                        {row.organizer_email ?? (
                          <span className="font-mono">{row.user_id.slice(0, 8)}…</span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-border">
                        {row.payment_status}
                      </Badge>
                      {row.audit ? (
                        <Badge variant="outline" className={AUDIT_OUTCOME_CHIP[row.audit.outcome]}>
                          audited: {row.audit.outcome}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">
                          not audited
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* ---- the claim ---- */}
                  <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                    <div className="flex items-baseline gap-1">
                      <span className="shrink-0 font-medium text-foreground/70">Amount:</span>
                      <span className="font-semibold text-foreground">
                        {formatCurrencyINR(row.amount_inr)}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-baseline gap-1">
                      <span className="shrink-0 font-medium text-foreground/70">UTR:</span>
                      <span className="truncate font-mono text-foreground">{row.utr}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="shrink-0 font-medium text-foreground/70">Submitted:</span>
                      <span className="text-foreground">{formatDateTime(row.created_at)}</span>
                    </div>
                    <div className="flex min-w-0 items-baseline gap-1 sm:col-span-2 lg:col-span-3">
                      <span className="shrink-0 font-medium text-foreground/70">
                        Entitlement window:
                      </span>
                      <span className="text-foreground">
                        {formatDateTime(row.entitlement_starts_at)} →{" "}
                        {formatDateTime(row.entitlement_ends_at)}
                      </span>
                      <span
                        className={`${CHIP_BASE} ${
                          row.entitlement_active
                            ? "bg-success/15 text-success border-success/30"
                            : "bg-muted/40 text-muted-foreground border-border"
                        }`}
                      >
                        {row.entitlement_active ? "active" : "not active"}
                      </span>
                    </div>
                  </div>

                  {countUnexpected && (
                    <div className="flex items-start gap-1.5 rounded border border-warning/30 bg-warning/10 px-2 py-1 text-xs">
                      <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
                      <span className="font-semibold text-warning">
                        {row.auto_entitlement_count} auto_upi entitlements for this one payment —
                        expected exactly 1.
                        <span className="block font-normal">
                          Revoking ends every one of them, so read the result below rather than
                          assuming a single window was closed.
                        </span>
                      </span>
                    </div>
                  )}

                  {/* ---- evidence ---- */}
                  <div className="space-y-1 text-xs">
                    {/* Three distinct facts, three distinct renderings. Collapsing any
                        two of them would state something false about the evidence. */}
                    {row.screenshot_extraction_id === null ? (
                      <NoScreenshotNotice />
                    ) : row.file_path !== null ? (
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <ViewScreenshotButton filePath={row.file_path} />
                        <span className="truncate font-mono text-foreground/80">
                          {row.file_name ?? row.file_path}
                        </span>
                      </div>
                    ) : (
                      /* Unreachable while extraction_documents.file_path is NOT NULL,
                         but it must stay honest if it ever fires. ViewScreenshotButton
                         cannot be used here: its null-path copy reads "No stored file
                         for this extraction", which would be a claim about storage
                         this panel has no basis to make — all it knows is that the
                         read path returned no path. */
                      <div className="flex items-start gap-1.5">
                        <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
                        <span className="font-medium text-warning">
                          A screenshot was submitted and extracted, but this read path returned
                          no file path for it, so it cannot be opened here.
                          <span className="block font-normal text-foreground/80">
                            Find it in All Payments below, by UTR {row.utr}.
                          </span>
                        </span>
                      </div>
                    )}
                    <div className="flex min-w-0 items-baseline gap-1">
                      <span className="shrink-0 font-medium text-foreground/70">File hash:</span>
                      {row.file_hash ? (
                        <span className="truncate font-mono text-foreground">{row.file_hash}</span>
                      ) : (
                        <span className="font-normal italic text-foreground/70">
                          none recorded — the duplicate-screenshot invariant had nothing to compare
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ---- invariant verdicts ---- */}
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-foreground/70">Invariant verdicts</span>
                      <span
                        className={`${CHIP_BASE} ${
                          checkerMismatch
                            ? "bg-warning/15 text-warning border-warning/30"
                            : "bg-muted/40 text-muted-foreground border-border"
                        }`}
                      >
                        {checkerMismatch && <AlertCircle className="h-3 w-3 shrink-0" />}
                        checker version {row.checker_version ?? "unknown"}
                      </span>
                      {checkerMismatch && (
                        <span className="text-[11px] font-semibold text-warning">
                          not version {EXPECTED_CHECKER_VERSION} — these verdicts may not mean what
                          this panel says they mean.
                        </span>
                      )}
                    </div>

                    {row.verdicts === null ? (
                      <div className="flex items-start gap-1.5 rounded border border-warning/30 bg-warning/10 px-2 py-1 text-xs">
                        <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
                        <span className="font-semibold text-warning">
                          No invariant verdicts were recorded for this payment — nothing was
                          checked, or the record is gone. Treat it as unverified.
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {VERDICT_NAMES.map((name) => {
                          const verdict = row.verdicts?.[name];
                          return (
                            <span
                              key={name}
                              className={`${CHIP_BASE} ${
                                verdict
                                  ? VERDICT_CHIP[verdict]
                                  : "bg-muted/40 text-muted-foreground border-border"
                              }`}
                            >
                              {humanLabel(name)}: {verdict ?? "not recorded"}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* ---- current access, straight from the server ---- */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium text-foreground/70">Pro access now:</span>
                    <span
                      className={`${CHIP_BASE} ${
                        row.pro_still_active
                          ? "bg-success/15 text-success border-success/30"
                          : "bg-muted/40 text-muted-foreground border-border"
                      }`}
                    >
                      {row.pro_still_active ? "active" : "none"}
                    </span>
                    <span className="text-foreground/80">
                      {row.active_sources.length > 0
                        ? `sources: ${row.active_sources.join(", ")}`
                        : "no active entitlement sources"}
                    </span>
                  </div>

                  {/* ---- the revoke result: a dated record of the RPC response ---- */}
                  {outcomeMessage && revokeResult && revokeRecord && (
                    <div
                      role="status"
                      aria-live="polite"
                      className={`flex items-start gap-1.5 rounded border px-2 py-1.5 text-xs ${
                        outcomeMessage.tone === "warning"
                          ? "border-warning/30 bg-warning/10"
                          : "border-success/30 bg-success/10"
                      }`}
                    >
                      {outcomeMessage.tone === "warning" ? (
                        <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
                      ) : (
                        <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-success" />
                      )}
                      <span
                        className={`font-semibold ${
                          outcomeMessage.tone === "warning" ? "text-warning" : "text-success"
                        }`}
                      >
                        <span className="block font-normal text-foreground/80">
                          When you revoked at {formatDateTime(revokeRecord.at)} —
                        </span>
                        {outcomeMessage.text}
                        <span className="block font-normal text-foreground/80">
                          The organizer was not emailed. The payment status is still “
                          {revokeResult.payment_status}”. Audit recorded as “loophole”.
                        </span>
                      </span>
                    </div>
                  )}

                  {/* ---- existing audit ---- */}
                  {row.audit && (
                    <div className="rounded border border-border bg-muted/40 px-2 py-1.5 text-xs">
                      <p className="font-medium text-foreground">
                        Audited {formatDateTime(row.audit.audited_at)} — {row.audit.outcome} (
                        {humanLabel(row.audit.action_taken)})
                      </p>
                      <p className="text-foreground/80">{row.audit.reason}</p>
                    </div>
                  )}

                  {/* ---- actions ---- */}
                  <div className="space-y-2 border-t border-border pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-foreground/70">Outcome</span>
                      <Select
                        value={draftOutcome}
                        onValueChange={(value) =>
                          setOutcomeDraft((prev) => ({
                            ...prev,
                            [row.payment_id]: value as AuditOutcome,
                          }))
                        }
                      >
                        <SelectTrigger className="h-8 w-[19rem] text-xs">
                          <SelectValue placeholder="Choose an outcome" />
                        </SelectTrigger>
                        <SelectContent>
                          {OUTCOME_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value} className="text-xs">
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Textarea
                      value={draftReason}
                      onChange={(event) =>
                        setReasonDraft((prev) => ({
                          ...prev,
                          [row.payment_id]: event.target.value,
                        }))
                      }
                      placeholder="Reason — what you checked and what you concluded (required)"
                      className="min-h-[4.5rem] text-xs"
                      aria-label={`Audit reason for ${row.utr}`}
                    />

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={outcomeMissing || reasonBlank || savingAudit}
                        onClick={() => {
                          // The server enforces the reason too ('reason_required');
                          // checking here keeps an obvious mistake off the wire. The
                          // empty outcome has no server token because it is never
                          // sent — it is not a value the RPC accepts.
                          if (draftOutcome === "" || draftReason.trim().length === 0) return;
                          auditMutation.mutate({
                            paymentId: row.payment_id,
                            outcome: draftOutcome,
                            reason: draftReason.trim(),
                            // Carry the row's existing action forward. The RPC
                            // upserts action_taken from this argument, so sending
                            // the default "none" over a row already marked
                            // 'entitlement_revoked' would erase the record that the
                            // entitlement was pulled. A revocation is a fact that
                            // happened; re-auditing must not un-record it.
                            actionTaken: row.audit?.action_taken ?? "none",
                          });
                        }}
                      >
                        {savingAudit ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                        )}
                        Record audit
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => {
                          setRevokeTarget(row);
                          setRevokeReason(draftReason);
                        }}
                      >
                        <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                        Revoke entitlement…
                      </Button>

                      {(outcomeMissing || reasonBlank) && (
                        <span className="text-[11px] font-medium text-warning">
                          {outcomeMissing && reasonBlank
                            ? "Choose an outcome and write a reason before recording an audit."
                            : outcomeMissing
                              ? "Choose an outcome before recording an audit — there is no default."
                              : "A reason is required before an audit can be recorded."}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* One dialog for the whole list, driven by revokeTarget — the copy has to
          be identical on every row, so there is exactly one copy of it. */}
      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(next) => {
          if (!next && !revokeMutation.isPending) {
            setRevokeTarget(null);
            setRevokeReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this auto-approved entitlement?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-xs">
                <p className="text-foreground/80">
                  {revokeTarget?.tournament_title ?? "This tournament"} ·{" "}
                  {revokeTarget?.organizer_email ?? "unknown organizer"} ·{" "}
                  {revokeTarget ? formatCurrencyINR(revokeTarget.amount_inr) : ""} · UTR{" "}
                  <span className="font-mono">{revokeTarget?.utr ?? ""}</span>
                </p>
                <ul className="list-disc space-y-1 pl-4 font-medium text-foreground">
                  <li>The organizer is NOT emailed. Nothing is sent to them by this action.</li>
                  <li>
                    The payment stays “approved”. Its status is not changed, which keeps the UTR
                    and the screenshot blocked from reuse.
                  </li>
                  <li>
                    The audit for this payment will be recorded as “loophole”, overwriting any
                    earlier outcome you set on this payment.
                  </li>
                </ul>
                <p className="text-foreground/80">
                  Entitlements stack. Whether the organizer actually loses Pro is reported back on
                  the row once this finishes — it is not decided by this action alone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Textarea
            value={revokeReason}
            onChange={(event) => setRevokeReason(event.target.value)}
            placeholder="Reason for revoking (required — stored on the audit row)"
            className="min-h-[4.5rem] text-xs"
            aria-label="Reason for revoking"
          />
          {revokeReason.trim().length === 0 && (
            <p className="text-[11px] font-medium text-warning">
              A reason is required. The server rejects a blank one.
            </p>
          )}

          <AlertDialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={revokeMutation.isPending}
              onClick={() => {
                setRevokeTarget(null);
                setRevokeReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              disabled={revokeReason.trim().length === 0 || revokeMutation.isPending}
              onClick={() => {
                if (!revokeTarget || revokeReason.trim().length === 0) return;
                revokeMutation.mutate({
                  paymentId: revokeTarget.payment_id,
                  reason: revokeReason.trim(),
                });
              }}
            >
              {revokeMutation.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldAlert className="mr-1 h-3.5 w-3.5" />
              )}
              Revoke entitlement
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
