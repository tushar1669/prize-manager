-- ============================================================================
-- f2_auto_approval_report.sql — every payment the machine approved, with the
-- exact evidence it acted on and whatever oversight has been recorded since
-- ============================================================================
--
--   supabase db query --linked -f supabase/ops/f2_auto_approval_report.sql
--
-- READ-ONLY. It writes nothing. It ends in an ERROR on purpose — that is how
-- output is forced through the CLI, which swallows RAISE NOTICE and does not
-- reliably print SELECT results. The error text IS the report.
--
-- PREDICATE CHANGED 27 Aug 2026 (F3-B). It was:
--     status='approved' AND reviewed_by IS NULL
-- which identified an auto-approval by the ABSENCE of a human reviewer. That
-- is a "not yet actioned" filter wearing an identity's clothes.
-- revoke_auto_entitlement stamps reviewed_by, so under the old predicate the
-- first payment you ever revoked would silently vanish from this report — the
-- one row you most need to keep watching. The durable identity of an
-- auto-approval is the entitlement it created: source='auto_upi' AND
-- source_ref=payment.id. That survives revocation, rejection and re-review.
--
-- HOW TO READ IT: the verdicts line is what the gate saw. If a payment turns
-- out to be fraudulent, that line tells you which of the eight checks was
-- fooled — and that is the check to strengthen. Strengthening any check means
-- bumping PAYMENT_CHECKER_VERSION, which automatically invalidates every
-- verdict written by the old code (V3).
--
-- "also active" appears ONLY when some OTHER entitlement still grants Pro for
-- the same tournament and owner. Entitlements can stack — there is no unique
-- constraint on (tournament_id, owner_id) — so revoking the auto_upi row does
-- not always remove access. Do not assume it did; read the line.
-- ============================================================================

DO $rpt$
DECLARE
  v_out       text := '';
  v_n         int  := 0;
  v_live      int  := 0;
  v_unaudited int  := 0;
  r record;
BEGIN
  FOR r IN
    SELECT tp.id            AS payment_id,
           tp.created_at,
           tp.amount_inr,
           tp.utr,
           tp.status::text  AS status,
           coalesce(pr.email, '<no profile>')     AS organizer,
           coalesce(t.title, '<no tournament>')   AS title,
           v.checker_version,
           v.verdicts,
           coalesce(d.file_hash, '<no screenshot>') AS file_hash,
           (now() >= te.starts_at AND now() < te.ends_at) AS pro_active,
           te.ends_at,
           coalesce(ob.email_status, '<no oversight row>') AS oversight_email,
           aa.outcome, aa.reason, aa.action_taken, aa.audited_at,
           coalesce(mp.email, '<unknown>')        AS audited_by_email,
           (SELECT string_agg(DISTINCT te2.source, ', ')
              FROM public.tournament_entitlements te2
             WHERE te2.tournament_id = tp.tournament_id
               AND te2.owner_id      = tp.user_id
               AND te2.id           <> te.id
               AND now() >= te2.starts_at AND now() < te2.ends_at) AS other_sources
      FROM public.tournament_payments tp
      -- LATERAL, not a plain join: the entitlement is the identity here, and
      -- nothing stops a payment carrying more than one auto_upi row.
      LEFT JOIN LATERAL (
             SELECT e2.id, e2.starts_at, e2.ends_at
               FROM public.tournament_entitlements e2
              WHERE e2.source_ref = tp.id AND e2.source = 'auto_upi'
              ORDER BY e2.ends_at DESC
              LIMIT 1
           ) te ON true
      LEFT JOIN public.tournaments t                ON t.id  = tp.tournament_id
      LEFT JOIN public.profiles pr                  ON pr.id = tp.user_id
      LEFT JOIN public.extractions e                ON e.id  = tp.screenshot_extraction_id
      LEFT JOIN public.extraction_documents d       ON d.id  = e.document_id
      LEFT JOIN public.payment_invariant_verdicts v ON v.extraction_id = e.id
      LEFT JOIN public.payment_notification_outbox ob ON ob.payment_id = tp.id
                                                     AND ob.action = 'auto_approved'
      LEFT JOIN public.payment_auto_approval_audit aa ON aa.payment_id = tp.id
      LEFT JOIN public.profiles mp                  ON mp.id = aa.audited_by
     WHERE te.id IS NOT NULL
     ORDER BY tp.created_at DESC
  LOOP
    v_n := v_n + 1;
    IF r.pro_active      THEN v_live      := v_live + 1;      END IF;
    IF r.outcome IS NULL THEN v_unaudited := v_unaudited + 1; END IF;

    v_out := v_out
      || E'\n────────────────────────────────────────────────────────────'
      || E'\n  payment    ' || r.payment_id::text
      || E'\n  when       ' || to_char(r.created_at, 'DD Mon YYYY HH24:MI')
      || E'\n  organizer  ' || r.organizer
      || E'\n  tournament ' || r.title
      || E'\n  amount     Rs.' || r.amount_inr || '   UTR ' || r.utr
      || E'\n  status     ' || r.status
      || E'\n  pro active ' || CASE WHEN r.pro_active
                                    THEN 'YES until ' || to_char(r.ends_at, 'DD Mon YYYY')
                                    ELSE 'no  (window closed ' || to_char(r.ends_at, 'DD Mon YYYY HH24:MI') || ')'
                               END
      || CASE WHEN r.other_sources IS NOT NULL
              THEN E'\n  ALSO ACTIVE  Pro is STILL granted by: ' || r.other_sources
              ELSE '' END
      || E'\n  oversight  email ' || r.oversight_email
      || E'\n  file_hash  ' || r.file_hash
      || E'\n  verdicts   v' || coalesce(r.checker_version::text, '?') || '  '
      || coalesce(r.verdicts::text, '<none recorded>')
      || E'\n  audit      ' || CASE WHEN r.outcome IS NULL THEN 'NOT YET AUDITED'
                                    ELSE r.outcome || ' / ' || r.action_taken
                                         || ' by ' || r.audited_by_email
                                         || ' on ' || to_char(r.audited_at, 'DD Mon YYYY HH24:MI')
                                         || E'\n             reason: ' || r.reason
                               END;
  END LOOP;

  IF v_n = 0 THEN
    v_out := E'\n  (none yet — no payment has been auto-approved)';
  END IF;

  RAISE EXCEPTION E'AUTO-APPROVALS: % total, % still holding active Pro, % not yet audited\n%\n\n(This error is expected. Nothing was written.)',
    v_n, v_live, v_unaudited, v_out;
END
$rpt$;
