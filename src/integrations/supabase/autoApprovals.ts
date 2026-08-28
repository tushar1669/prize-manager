// types.ts is not regenerated here by deliberate decision; see B7.
//
// Consequence: the three F3 RPCs (list_auto_approvals, record_auto_approval_audit,
// revoke_auto_entitlement) are absent from the generated Database type, so every
// call has to be cast past it. This module is the ONLY place in src/ that does
// that casting. Nothing else may call these RPCs directly — the row and result
// shapes below are hand-maintained against the migrations that define them:
//   supabase/migrations/20260827120000_f3a_auto_approval_audit.sql
//   supabase/migrations/20260827130000_f3b_revoke_auto_entitlement.sql
//   supabase/migrations/20260828120000_f3c_list_auto_approvals.sql
//   supabase/migrations/20260828130000_f3c0b_list_auto_approvals_file_path.sql
//
// All three RPCs signal failure by `raise exception '<token>'`, which PostgREST
// surfaces as a PostgrestError whose `message` is that bare token. A raw
// PostgrestError is not an Error instance, so it does not survive `instanceof`
// checks, react-query error boundaries, or `error.message` access in a `catch`
// that has narrowed to Error. Every wrapper therefore rethrows a real Error
// carrying that message text verbatim, so callers can branch on 'not_master',
// 'reason_required' and 'not_an_auto_approval'.

import { supabase } from "./client";

export type Verdict = "pass" | "fail" | "skipped";

export type VerdictName =
  | "utr_format"
  | "utr_duplicate"
  | "amount_mismatch"
  | "payee_vpa_mismatch"
  | "payee_vpa_missing"
  | "date_stale"
  | "direction_not_outgoing"
  | "required_fields_missing";

/** The `outcome` CHECK on payment_auto_approval_audit. */
export type AuditOutcome = "ok" | "loophole" | "uncertain";

/** The `action_taken` CHECK on payment_auto_approval_audit. */
export type AuditAction = "none" | "entitlement_revoked";

export type AutoApprovalRow = {
  payment_id: string;
  tournament_id: string;
  tournament_title: string | null;
  user_id: string;
  organizer_email: string | null;
  amount_inr: number;
  utr: string;
  payment_status: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  screenshot_extraction_id: string | null;
  file_hash: string | null;
  file_path: string | null;
  file_name: string | null;
  entitlement_id: string;
  entitlement_starts_at: string;
  entitlement_ends_at: string;
  entitlement_active: boolean;
  auto_entitlement_count: number;
  pro_still_active: boolean;
  active_sources: string[];
  checker_version: number | null;
  verdicts: Record<VerdictName, Verdict> | null;
  audit: {
    outcome: AuditOutcome;
    reason: string;
    action_taken: AuditAction;
    audited_by: string | null;
    audited_at: string;
  } | null;
};

export type RevokeResult = {
  payment_id: string;
  entitlements_ended: number;
  ends_at: string | null;
  pro_still_active: boolean;
  active_sources: string[];
  payment_status: string;
  organizer_emailed: boolean;
};

/**
 * A real Error carrying the RPC's message text.
 *
 * `message` is the server token unchanged — do not prettify it here. The panel
 * decides how to phrase 'not_master' for a human; this layer only guarantees
 * the token survives the trip.
 */
export class AutoApprovalRpcError extends Error {
  readonly rpc: string;
  readonly code: string | null;
  readonly details: string | null;
  readonly hint: string | null;

  constructor(rpc: string, error: { message?: string; code?: string; details?: string; hint?: string }) {
    super(error.message && error.message.length > 0 ? error.message : `${rpc} failed`);
    this.name = "AutoApprovalRpcError";
    this.rpc = rpc;
    this.code = error.code ?? null;
    this.details = error.details ?? null;
    this.hint = error.hint ?? null;
  }
}

async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new AutoApprovalRpcError(fn, error);
  return data as unknown as T;
}

/**
 * Master-only. Returns every F2 auto-approval, newest first.
 *
 * An auto-approval is identified server-side by the entitlement it created
 * (source='auto_upi' AND source_ref=payment.id), never by `reviewed_by IS NULL`
 * — revoke_auto_entitlement stamps that column, so a revoked row would silently
 * drop out of the list. Guardrail X1.
 */
export async function listAutoApprovals(): Promise<AutoApprovalRow[]> {
  const rows = await callRpc<unknown>("list_auto_approvals", {});
  // The RPC returns `[]` rather than null when empty. Anything that is not an
  // array means the contract moved, and that is NOT the same fact as "there are
  // no auto-approvals" — so it must never be coerced into one. Falling back to
  // `[]` here would make the panel render "No auto-approvals yet" on the one
  // surface whose whole job is to prove someone is watching: a broken read path
  // would be indistinguishable from a clean quarter. That is the D21/D32/D40
  // failure shape. Throwing is correct because the panel already has an
  // explicit error state, and "we could not read the list" is the only honest
  // thing to put on screen when the list could not be read.
  if (!Array.isArray(rows)) {
    throw new AutoApprovalRpcError("list_auto_approvals", {
      message:
        "list_auto_approvals did not return an array — the contract moved. Received " +
        (rows === null ? "null" : typeof rows) +
        ". The list could not be read, so no conclusion about auto-approvals can be drawn.",
    });
  }
  return rows as AutoApprovalRow[];
}

/**
 * Master-only. Upserts the single audit row for one auto-approval.
 *
 * The server rejects a blank reason with 'reason_required' and an unknown
 * outcome with 'invalid_outcome'; the panel checks the reason too, so the
 * common case never round-trips.
 */
export async function recordAutoApprovalAudit(
  paymentId: string,
  outcome: AuditOutcome,
  reason: string,
  actionTaken: AuditAction = "none"
): Promise<void> {
  await callRpc<null>("record_auto_approval_audit", {
    p_payment_id: paymentId,
    p_outcome: outcome,
    p_reason: reason,
    p_action_taken: actionTaken,
  });
}

/**
 * Master-only. Ends the auto_upi entitlement window without touching the
 * payment's status, so no notification trigger fires and the UTR stays blocked.
 *
 * The returned pro_still_active / active_sources are the ONLY honest answer to
 * "did the organizer actually lose Pro" — entitlements stack, so a coupon or a
 * manual grant can keep access alive after this call succeeds. Callers must
 * render those two fields from this response, never assume access was removed.
 */
export async function revokeAutoEntitlement(paymentId: string, reason: string): Promise<RevokeResult> {
  return await callRpc<RevokeResult>("revoke_auto_entitlement", {
    p_payment_id: paymentId,
    p_reason: reason,
  });
}
