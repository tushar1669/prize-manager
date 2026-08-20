-- ============================================================================
-- f2_auto_approval_report.sql — every payment the machine approved, with the
-- exact evidence it acted on
-- ============================================================================
--
--   supabase db query --linked -f supabase/ops/f2_auto_approval_report.sql
--
-- READ-ONLY. It writes nothing. It ends in an ERROR on purpose — that is how
-- output is forced through the CLI, which swallows RAISE NOTICE and does not
-- reliably print SELECT results. The error text IS the report.
--
-- Predicate: status='approved' AND reviewed_by IS NULL.
-- Verified 20 Aug 2026: all 7 historical payments carry a reviewer, so this
-- predicate has zero false positives from history. Every row it returns was
-- approved by the F2 gate, never by a human.
--
-- HOW TO READ IT: the verdicts line is what the gate saw. If a payment turns
-- out to be fraudulent, that line tells you which of the eight checks was
-- fooled — and that is the check to strengthen. Strengthening any check means
-- bumping PAYMENT_CHECKER_VERSION, which automatically invalidates every
-- verdict written by the old code (V3).
-- ============================================================================

DO $rpt$
DECLARE
  v_out text := '';
  v_n   int  := 0;
  v_live int := 0;
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
           (te.id IS NOT NULL
              AND now() >= te.starts_at
              AND now() <  te.ends_at)            AS pro_active,
           coalesce(ob.email_status, '<no oversight row>') AS oversight_email
      FROM public.tournament_payments tp
      LEFT JOIN public.tournaments t              ON t.id = tp.tournament_id
      LEFT JOIN public.profiles pr                ON pr.id = tp.user_id
      LEFT JOIN public.extractions e              ON e.id = tp.screenshot_extraction_id
      LEFT JOIN public.extraction_documents d     ON d.id = e.document_id
      LEFT JOIN public.payment_invariant_verdicts v ON v.extraction_id = e.id
      LEFT JOIN public.tournament_entitlements te ON te.source_ref = tp.id
                                                 AND te.source = 'auto_upi'
      LEFT JOIN public.payment_notification_outbox ob ON ob.payment_id = tp.id
                                                 AND ob.action = 'auto_approved'
     WHERE tp.status = 'approved'
       AND tp.reviewed_by IS NULL
     ORDER BY tp.created_at DESC
  LOOP
    v_n := v_n + 1;
    IF r.pro_active THEN v_live := v_live + 1; END IF;
    v_out := v_out
      || E'\n────────────────────────────────────────────────────────────'
      || E'\n  payment    ' || r.payment_id::text
      || E'\n  when       ' || to_char(r.created_at, 'DD Mon YYYY HH24:MI')
      || E'\n  organizer  ' || r.organizer
      || E'\n  tournament ' || r.title
      || E'\n  amount     Rs.' || r.amount_inr || '   UTR ' || r.utr
      || E'\n  pro active ' || CASE WHEN r.pro_active THEN 'YES' ELSE 'no (expired or revoked)' END
      || E'\n  oversight  email ' || r.oversight_email
      || E'\n  file_hash  ' || r.file_hash
      || E'\n  verdicts   v' || coalesce(r.checker_version::text, '?') || '  '
      || coalesce(r.verdicts::text, '<none recorded>');
  END LOOP;

  IF v_n = 0 THEN
    v_out := E'\n  (none yet — no payment has been auto-approved)';
  END IF;

  RAISE EXCEPTION E'AUTO-APPROVALS: % total, % still holding active Pro\n%\n\n(This error is expected. Nothing was written.)',
    v_n, v_live, v_out;
END
$rpt$;
