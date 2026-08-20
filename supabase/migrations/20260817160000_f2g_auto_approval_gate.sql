-- ===========================================================================
-- F2-G · conditional auto-approval inside submit_tournament_payment_claim
--
-- WHY HERE, and not in /extract or a new RPC (PROJECT_STATE §12.1):
--   At claim time auth.uid() is real, ownership is checked, the amount is
--   validated against expected_payment_amount_inr, the UTR is matched, and the
--   extraction is pinned to the payment. Findings 3 and 4 both disappear.
--   review_tournament_payment cannot be reused — its first statement is
--   has_role(auth.uid(),'master') and auth.uid() is NULL under service-role, so
--   it raises FORBIDDEN — and guardrail 10 forbids changing it. Hence the
--   approval write is mirrored here rather than delegated.
--
-- WHAT IS UNCHANGED: the signature (RETURNS uuid, so no DROP), SECURITY
--   DEFINER, search_path, the grants, and every line from BEGIN down to and
--   including the INSERT. The 17-branch F0d/F1 harness is pinned to all of it.
--
-- WHAT IS ADDED: one block after the INSERT. It contains NO RAISE. A claim
--   that does not qualify simply stays 'pending' and reaches the manual queue
--   exactly as before F2 — no new error, no new message, no new way for an
--   honest organizer to get stuck, and nothing for an attacker to iterate
--   against (F2-2, fraud oracle).
--
-- SHIPS INERT: platform_feature_flags.payment_auto_approve is false.
-- ===========================================================================

begin;

CREATE OR REPLACE FUNCTION public.submit_tournament_payment_claim(
  p_tournament_id uuid,
  p_amount_inr integer,
  p_utr text,
  p_screenshot_extraction_id uuid,
  p_return_to text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_canonical_amount integer;
  v_expected_amount integer;
  v_payment_id uuid;
  v_return_to text;
  v_is_master boolean;
  v_utr_norm text;
  v_uploaded_by uuid;
  v_doc_type public.doc_type;
  v_extracted_utr text;
  v_extracted_txn_id text;
  v_constraint text;
  v_phone text;
  v_email_ok boolean;
  -- F2 additions
  v_now timestamptz := now();
  v_verdicts jsonb;
  v_all_pass boolean;
  v_hash_ok boolean;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  v_is_master := public.has_role(v_user_id, 'master'::public.app_role);

  SELECT t.owner_id INTO v_owner_id FROM public.tournaments t
  WHERE t.id = p_tournament_id AND t.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT (v_owner_id = v_user_id OR v_is_master) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- ── F1-B3: profile prerequisite ──────────────────────────────────────────
  -- Stays ABOVE the price lookup and ABOVE the F0d block (D37, harness case Q).
  IF NOT v_is_master THEN
    SELECT p.phone INTO v_phone
    FROM public.profiles p WHERE p.id = v_user_id;

    SELECT (u.email_confirmed_at IS NOT NULL) INTO v_email_ok
    FROM auth.users u WHERE u.id = v_user_id;

    IF v_phone IS NULL OR NOT COALESCE(v_email_ok, false) THEN
      RAISE EXCEPTION 'PROFILE_INCOMPLETE';
    END IF;
  END IF;
  -- ── end F1-B3 ────────────────────────────────────────────────────────────

  -- PF1-B: single source of truth. The coupon lookup that used to sit inline
  -- below now lives inside this function; it has no side effects and cannot
  -- raise, so the order of every RAISE below is unchanged.
  SELECT amt.canonical_amount_inr, amt.expected_amount_inr
    INTO v_canonical_amount, v_expected_amount
  FROM public.expected_payment_amount_inr(p_tournament_id, v_user_id) amt;

  IF v_canonical_amount = 0 THEN RAISE EXCEPTION 'TOURNAMENT_ALREADY_FREE'; END IF;
  IF p_utr IS NULL OR length(trim(p_utr)) < 6 THEN RAISE EXCEPTION 'INVALID_UTR'; END IF;

  IF p_amount_inr IS DISTINCT FROM v_expected_amount THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_payments tp
    WHERE tp.tournament_id = p_tournament_id AND tp.user_id = v_user_id AND tp.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'PENDING_PAYMENT_ALREADY_EXISTS';
  END IF;

  -- ── F0d (D30/D31) ────────────────────────────────────────────────────────
  v_utr_norm := public.normalize_utr(p_utr);

  IF EXISTS (
    SELECT 1 FROM public.tournament_payments tp
    WHERE tp.status <> 'rejected'
      AND public.normalize_utr(tp.utr) = v_utr_norm
  ) THEN
    RAISE EXCEPTION 'UTR_ALREADY_USED';
  END IF;

  IF p_screenshot_extraction_id IS NOT NULL THEN
    SELECT d.uploaded_by, d.doc_type, (e.payload ->> 'utr'), (e.payload ->> 'txn_id')
      INTO v_uploaded_by, v_doc_type, v_extracted_utr, v_extracted_txn_id
    FROM public.extractions e
    JOIN public.extraction_documents d ON d.id = e.document_id
    WHERE e.id = p_screenshot_extraction_id;

    IF NOT FOUND
       OR v_doc_type <> 'payment_screenshot'::public.doc_type
       OR NOT (v_uploaded_by = v_user_id OR v_is_master) THEN
      RAISE EXCEPTION 'EXTRACTION_NOT_OWNED';
    END IF;

    IF v_extracted_utr IS NULL OR length(trim(v_extracted_utr)) = 0 THEN
      RAISE EXCEPTION 'UTR_EXTRACTION_UNREADABLE';
    END IF;

    IF public.normalize_utr(v_extracted_utr) <> v_utr_norm THEN
      IF v_extracted_txn_id IS NOT NULL
         AND public.normalize_utr(v_extracted_txn_id) = v_utr_norm THEN
        RAISE EXCEPTION 'UTR_IS_TXN_ID';
      END IF;
      RAISE EXCEPTION 'UTR_MISMATCH';
    END IF;
  END IF;
  -- ── end F0d ──────────────────────────────────────────────────────────────

  IF p_return_to IS NOT NULL
     AND length(p_return_to) BETWEEN 1 AND 500
     AND p_return_to ~ '^/[^/\\]'
     AND p_return_to !~ '[[:cntrl:]]'
  THEN
    v_return_to := p_return_to;
  ELSE
    v_return_to := NULL;
  END IF;

  BEGIN
    INSERT INTO public.tournament_payments(
      tournament_id, user_id, amount_inr, utr, status, screenshot_extraction_id, return_to)
    VALUES (
      p_tournament_id, v_user_id, p_amount_inr, trim(p_utr), 'pending', p_screenshot_extraction_id, v_return_to)
    RETURNING id INTO v_payment_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'uq_tournament_payments_utr_active' THEN
      RAISE EXCEPTION 'UTR_ALREADY_USED';
    ELSIF v_constraint = 'uq_tournament_payments_pending' THEN
      RAISE EXCEPTION 'PENDING_PAYMENT_ALREADY_EXISTS';
    ELSE
      RAISE;
    END IF;
  END;

  -- ══ F2: conditional auto-approval ════════════════════════════════════════
  -- Silent by construction: this block contains no RAISE. Failing any condition
  -- leaves the payment 'pending' — today's behaviour, unchanged.
  --
  -- Master-submitted claims never auto-approve. F1 lets master bypass the
  -- profile gate so he can act on an organizer's behalf; if auto-approval
  -- honoured that carve-out too, a helper path would become an unreviewed
  -- write path — the shape of E1 and E3. Master already has an Approve button.
  IF p_screenshot_extraction_id IS NOT NULL
     AND NOT v_is_master
     AND EXISTS (
       SELECT 1 FROM public.platform_feature_flags f
       WHERE f.key = 'payment_auto_approve' AND f.enabled
     )
  THEN
    -- checker_version must match exactly. A verdict written by an older build
    -- is evidence about that build, not this one: image ebba2416fd produced
    -- three different named flag sets from byte-identical payloads because F0c
    -- shipped between runs. NULL here means the gate simply does not fire.
    SELECT v.verdicts INTO v_verdicts
    FROM public.payment_invariant_verdicts v
    WHERE v.extraction_id = p_screenshot_extraction_id
      AND v.checker_version = 1;

    IF v_verdicts IS NOT NULL THEN
      -- "skipped is not pass" (PROJECT_STATE §12.2). All eight must read pass.
      -- Counting the total as well as the passes means a malformed object can
      -- never satisfy this, independently of the table's CHECK constraint.
      SELECT count(*) FILTER (WHERE x.value = 'pass') = 8 AND count(*) = 8
        INTO v_all_pass
      FROM jsonb_each_text(v_verdicts) x;

      -- file_hash replay (§12.3): global, non-rejected payments only, and it
      -- DENIES auto-approval rather than blocking submission.
      --   tp.id <> v_payment_id is load-bearing: the row inserted moments ago
      --   is itself pending and carries this very hash, so without the
      --   exclusion every auto-approval would collide with itself and the gate
      --   would silently never fire.
      --   Restricting to non-rejected preserves D15 — live image 282d67b367
      --   was rejected 3 Aug then legitimately resubmitted and approved 6 Aug.
      SELECT NOT EXISTS (
        SELECT 1
        FROM public.extractions e_self
        JOIN public.extraction_documents d_self  ON d_self.id = e_self.document_id
        JOIN public.extraction_documents d_other ON d_other.file_hash = d_self.file_hash
        JOIN public.extractions e_other          ON e_other.document_id = d_other.id
        JOIN public.tournament_payments tp       ON tp.screenshot_extraction_id = e_other.id
        WHERE e_self.id = p_screenshot_extraction_id
          AND tp.id <> v_payment_id
          AND tp.status <> 'rejected'
      ) INTO v_hash_ok;

      IF v_all_pass AND v_hash_ok THEN
        -- Mirrors review_tournament_payment's approve path in the SAME ORDER:
        -- entitlement first, then status, then referral rewards. The order
        -- matters — the status UPDATE fires trg_enqueue_payment_notification,
        -- so the entitlement must already exist by the time the organizer can
        -- act on the email.
        INSERT INTO public.tournament_entitlements
          (tournament_id, owner_id, source, source_ref, starts_at, ends_at)
        VALUES (p_tournament_id, v_user_id, 'auto_upi', v_payment_id,
                v_now, v_now + interval '365 days');

        -- reviewed_by stays NULL: setting it to auth.uid() would record the
        -- organizer as their own reviewer. status='approved' AND reviewed_by
        -- IS NULL is therefore the auto-approval predicate for /admin/payments
        -- (F2-4) — manual approvals always populate it.
        -- review_note is terse because the organizer can read their own
        -- payment row; the itemised verdicts go to the master-only outbox row.
        UPDATE public.tournament_payments
          SET status      = 'approved',
              review_note = 'Auto-approved.',
              reviewed_by = NULL,
              reviewed_at = v_now
        WHERE id = v_payment_id;

        -- Mirrored from review_tournament_payment. Omitting this would silently
        -- stop referral rewards for every auto-approved payment.
        PERFORM public.issue_referral_rewards(v_user_id, p_tournament_id);

        -- Oversight notice to the platform owner (F2-4). The organizer's own
        -- approval email was already enqueued by the AFTER UPDATE OF status
        -- trigger above, with no wiring (D17). Distinct action, so the
        -- uq_payment_notification_outbox_payment_action index permits both.
        INSERT INTO public.payment_notification_outbox
          (payment_id, tournament_id, user_id, action, recipient_email, review_note)
        VALUES (v_payment_id, p_tournament_id, v_user_id, 'auto_approved',
                'chess.tushar@gmail.com',
                'Verdicts at checker_version 1: ' || v_verdicts::text)
        ON CONFLICT (payment_id, action) DO NOTHING;
      END IF;
    END IF;
  END IF;
  -- ══ end F2 ═══════════════════════════════════════════════════════════════

  RETURN v_payment_id;
END;
$function$;

-- Grant hygiene: both revoke paths, every time (D18 / N1). CREATE OR REPLACE
-- preserves existing grants, but asserting the end state costs nothing and the
-- default-privilege path on this project grants EXECUTE to anon and
-- authenticated independently of PUBLIC.
REVOKE ALL ON FUNCTION public.submit_tournament_payment_claim(uuid, integer, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_tournament_payment_claim(uuid, integer, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_tournament_payment_claim(uuid, integer, text, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Self-verification. Any failure aborts the whole migration.
-- Every expected value below was QUERIED from the live function before this
-- migration was written, not recalled — PF1-A's guard failed because it
-- asserted a state nobody had measured.
-- ---------------------------------------------------------------------------
do $$
declare
  v_src   text;
  v_oid   oid;
  v_code  text;
  v_want  integer;
  v_got   integer;
  v_codes text[] := array[
    'UNAUTHORIZED','PROFILE_INCOMPLETE','TOURNAMENT_ALREADY_FREE','INVALID_UTR',
    'INVALID_PAYMENT_AMOUNT','PENDING_PAYMENT_ALREADY_EXISTS','UTR_ALREADY_USED',
    'EXTRACTION_NOT_OWNED','UTR_EXTRACTION_UNREADABLE','UTR_IS_TXN_ID','UTR_MISMATCH'];
  v_counts integer[] := array[3,1,1,1,1,2,2,1,1,1,1];
begin
  select p.oid, p.prosrc into v_oid, v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_tournament_payment_claim';

  if v_oid is null then
    raise exception 'F2G FAIL: function is missing';
  end if;

  -- Exactly one overload must exist. F0d dropped the 3-arg and 4-arg versions;
  -- a signature change here would have created a second one instead of
  -- replacing the first.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname='submit_tournament_payment_claim') <> 1 then
    raise exception 'F2G FAIL: more than one overload exists — the signature changed';
  end if;

  if (select pg_get_function_result(v_oid)) <> 'uuid' then
    raise exception 'F2G FAIL: return type is %, expected uuid',
      (select pg_get_function_result(v_oid));
  end if;

  if not (select p.prosecdef from pg_proc p where p.oid = v_oid) then
    raise exception 'F2G FAIL: SECURITY DEFINER was lost';
  end if;

  if not exists (select 1 from pg_proc p
                 where p.oid = v_oid and 'search_path=public' = any(p.proconfig)) then
    raise exception 'F2G FAIL: search_path=public was lost';
  end if;

  -- ERROR CENSUS: the gate must add no new failure mode (F2-2).
  for i in 1 .. array_length(v_codes, 1) loop
    v_code := v_codes[i];
    v_want := v_counts[i];
    v_got  := (length(v_src) - length(replace(v_src, 'RAISE EXCEPTION '''||v_code||'''', '')))
              / length('RAISE EXCEPTION '''||v_code||'''');
    if v_got <> v_want then
      raise exception 'F2G FAIL: % appears % times, expected %', v_code, v_got, v_want;
    end if;
  end loop;

  v_got := (length(v_src) - length(replace(v_src, 'RAISE EXCEPTION', ''))) / length('RAISE EXCEPTION');
  if v_got <> 15 then
    raise exception 'F2G FAIL: % total RAISE EXCEPTION, expected 15 — the gate is not silent', v_got;
  end if;

  -- GATE ORDERING (D37 harness case Q): profile gate above price lookup,
  -- price lookup above the F0d block.
  if not (strpos(v_src,'PROFILE_INCOMPLETE') < strpos(v_src,'expected_payment_amount_inr')
          and strpos(v_src,'expected_payment_amount_inr') < strpos(v_src,'UTR_ALREADY_USED')) then
    raise exception 'F2G FAIL: gate ordering broken — F1 is now bypassable by ordering';
  end if;

  -- The F2 block must sit AFTER the INSERT, or v_payment_id is not yet set.
  if strpos(v_src, 'RETURNING id INTO v_payment_id') >= strpos(v_src, 'payment_auto_approve') then
    raise exception 'F2G FAIL: the F2 block is above the INSERT';
  end if;

  -- The self-exclusion that stops the file_hash check colliding with its own row.
  if strpos(v_src, 'tp.id <> v_payment_id') = 0 then
    raise exception 'F2G FAIL: file_hash self-exclusion is missing — the gate could never fire';
  end if;

  -- Referral rewards must be mirrored, or they silently stop for auto-approvals.
  if strpos(v_src, 'issue_referral_rewards') = 0 then
    raise exception 'F2G FAIL: issue_referral_rewards is not called';
  end if;

  -- GRANTS (D18 / N1): OID-based, the reliable method.
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'F2G FAIL: anon holds EXECUTE';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'F2G FAIL: authenticated lost EXECUTE — every organizer is locked out';
  end if;

  -- MUST SHIP INERT.
  if (select enabled from public.platform_feature_flags where key='payment_auto_approve') then
    raise exception 'F2G FAIL: payment_auto_approve is ENABLED — F2 must ship off';
  end if;

  -- Guardrail 10: review_tournament_payment must be untouched and still the
  -- only writer of manual_upi.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='review_tournament_payment') <> 1 then
    raise exception 'F2G FAIL: review_tournament_payment was disturbed';
  end if;

  -- Nothing may have auto-approved during this migration.
  if exists (select 1 from public.tournament_entitlements where source='auto_upi') then
    raise exception 'F2G FAIL: an auto_upi entitlement exists already';
  end if;
end $$;

notify pgrst, 'reload schema';

select 'F2G OK' as result;

commit;
