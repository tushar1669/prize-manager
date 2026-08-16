-- PF1-B — one answer to "what should this person pay for this tournament".
-- Before: submit_tournament_payment_claim carried its own coupon block, and
-- extract/paymentTrustCheck.ts carried a third copy of the whole rule.
-- After: expected_payment_amount_inr is the only implementation. The claim RPC
-- calls it here; extract calls it in PF1-C.

BEGIN;

CREATE OR REPLACE FUNCTION public.expected_payment_amount_inr(
  p_tournament_id uuid,
  p_user_id uuid)
RETURNS TABLE(billing_basis integer, canonical_amount_inr integer, expected_amount_inr integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_basis integer;
  v_canonical integer;
  v_expected integer;
BEGIN
  v_basis := public.tournament_billing_basis(p_tournament_id);
  SELECT tt.amount_inr INTO v_canonical FROM public.tournament_pro_tier(v_basis) tt;

  -- Coupon predicate, moved verbatim out of submit_tournament_payment_claim.
  SELECT cr.amount_after INTO v_expected
  FROM public.coupon_redemptions cr
  WHERE cr.tournament_id = p_tournament_id
    AND cr.redeemed_by_user_id = p_user_id
    AND cr.amount_before = v_canonical
    AND cr.amount_after > 0
    AND cr.amount_after < v_canonical
    AND NOT EXISTS (
      SELECT 1 FROM public.tournament_entitlements te
      WHERE te.tournament_id = cr.tournament_id
        AND te.source = 'coupon'
        AND te.source_ref = cr.id
        AND now() >= te.starts_at
        AND now() <  te.ends_at
    )
  ORDER BY cr.redeemed_at DESC
  LIMIT 1;

  billing_basis        := v_basis;
  canonical_amount_inr := v_canonical;
  expected_amount_inr  := COALESCE(v_expected, v_canonical);
  RETURN NEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION public.expected_payment_amount_inr(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expected_payment_amount_inr(uuid,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.expected_payment_amount_inr(uuid,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expected_payment_amount_inr(uuid,uuid) TO service_role;

-- ── equivalence over every real pair, BEFORE the claim RPC is rewired ─────
DO $verify$
DECLARE
  v_bad integer;
BEGIN
  WITH pairs AS (
    SELECT DISTINCT tp.tournament_id AS tid, tp.user_id AS uid FROM public.tournament_payments tp
    UNION
    SELECT DISTINCT cr.tournament_id, cr.redeemed_by_user_id FROM public.coupon_redemptions cr
    UNION
    SELECT t.id, t.owner_id FROM public.tournaments t
  ),
  old AS (
    SELECT p.tid, p.uid, b.basis,
           (CASE WHEN b.basis <= 150 THEN 0
                 WHEN b.basis <= 500 THEN 500
                 ELSE 1000 END) AS canonical
    FROM pairs p
    CROSS JOIN LATERAL (
      SELECT GREATEST(
        (SELECT count(*)::int FROM public.players pl WHERE pl.tournament_id = p.tid),
        (SELECT COALESCE(max(w.players_count_max),0)::int
           FROM public.tournament_player_watermark w WHERE w.tournament_id = p.tid)
      ) AS basis
    ) b
  ),
  old2 AS (
    SELECT o.*,
           COALESCE((
             SELECT cr.amount_after FROM public.coupon_redemptions cr
             WHERE cr.tournament_id = o.tid
               AND cr.redeemed_by_user_id = o.uid
               AND cr.amount_before = o.canonical
               AND cr.amount_after > 0
               AND cr.amount_after < o.canonical
               AND NOT EXISTS (
                 SELECT 1 FROM public.tournament_entitlements te
                 WHERE te.tournament_id = cr.tournament_id
                   AND te.source = 'coupon'
                   AND te.source_ref = cr.id
                   AND now() >= te.starts_at
                   AND now() <  te.ends_at)
             ORDER BY cr.redeemed_at DESC LIMIT 1), o.canonical) AS expected
    FROM old o
  )
  SELECT count(*) INTO v_bad
  FROM old2 o
  CROSS JOIN LATERAL public.expected_payment_amount_inr(o.tid, o.uid) f
  WHERE f.billing_basis        IS DISTINCT FROM o.basis
     OR f.canonical_amount_inr IS DISTINCT FROM o.canonical
     OR f.expected_amount_inr  IS DISTINCT FROM o.expected;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'PF1B_VERIFY_FAILED: % (tournament,user) pairs disagree', v_bad;
  END IF;
END
$verify$;

-- ── rewire the claim RPC ─────────────────────────────────────────────────
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
AS $fn$
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

  RETURN v_payment_id;
END;
$fn$;

-- ── structural proof: one implementation, and the gate did not move ──────
DO $struct$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'submit_tournament_payment_claim';

  IF v_src NOT LIKE '%expected_payment_amount_inr%' THEN
    RAISE EXCEPTION 'PF1B_STRUCT_FAILED: claim RPC does not call the shared function';
  END IF;
  IF v_src LIKE '%coupon_redemptions%' THEN
    RAISE EXCEPTION 'PF1B_STRUCT_FAILED: an inline coupon copy survives in the claim RPC';
  END IF;
  IF v_src LIKE '%get_tournament_pro_price%' THEN
    RAISE EXCEPTION 'PF1B_STRUCT_FAILED: claim RPC still calls the UI-facing price function';
  END IF;

  -- D37 / harness case Q: the F1 gate must sit ABOVE the price lookup and
  -- ABOVE the F0d duplicate block, or it is bypassable by ordering.
  IF strpos(v_src, 'PROFILE_INCOMPLETE') = 0
     OR strpos(v_src, 'PROFILE_INCOMPLETE') > strpos(v_src, 'expected_payment_amount_inr')
     OR strpos(v_src, 'PROFILE_INCOMPLETE') > strpos(v_src, 'UTR_ALREADY_USED') THEN
    RAISE EXCEPTION 'PF1B_STRUCT_FAILED: F1 profile gate is no longer above the price lookup / F0d block';
  END IF;
END
$struct$;

-- ── error-code census: nothing lost, nothing duplicated ──────────────────
DO $census$
DECLARE
  v_src text;
  v_codes text[][] := ARRAY[
    ['UNAUTHORIZED','3'],
    ['PROFILE_INCOMPLETE','1'],
    ['TOURNAMENT_ALREADY_FREE','1'],
    ['INVALID_UTR','1'],
    ['INVALID_PAYMENT_AMOUNT','1'],
    ['PENDING_PAYMENT_ALREADY_EXISTS','2'],
    ['UTR_ALREADY_USED','2'],
    ['EXTRACTION_NOT_OWNED','1'],
    ['UTR_EXTRACTION_UNREADABLE','1'],
    ['UTR_IS_TXN_ID','1'],
    ['UTR_MISMATCH','1']
  ];
  i integer;
  v_n integer;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'submit_tournament_payment_claim';

  FOR i IN 1 .. array_length(v_codes, 1) LOOP
    v_n := (length(v_src) - length(replace(v_src, v_codes[i][1], ''))) / length(v_codes[i][1]);
    IF v_n <> v_codes[i][2]::int THEN
      RAISE EXCEPTION 'PF1B_CENSUS_FAILED: % appears % times, expected %',
        v_codes[i][1], v_n, v_codes[i][2];
    END IF;
  END LOOP;
END
$census$;

-- ── grant proof ──────────────────────────────────────────────────────────
DO $grants$
DECLARE
  v_msg text := '';
BEGIN
  IF has_function_privilege('anon','public.expected_payment_amount_inr(uuid,uuid)','EXECUTE')
    THEN v_msg := v_msg || 'anon can execute expected_payment_amount_inr; '; END IF;
  IF has_function_privilege('authenticated','public.expected_payment_amount_inr(uuid,uuid)','EXECUTE')
    THEN v_msg := v_msg || 'authenticated can execute expected_payment_amount_inr; '; END IF;
  IF NOT has_function_privilege('service_role','public.expected_payment_amount_inr(uuid,uuid)','EXECUTE')
    THEN v_msg := v_msg || 'service_role CANNOT execute expected_payment_amount_inr; '; END IF;
  IF NOT has_function_privilege('authenticated','public.submit_tournament_payment_claim(uuid,integer,text,uuid,text)','EXECUTE')
    THEN v_msg := v_msg || 'authenticated LOST claim RPC EXECUTE; '; END IF;
  IF has_function_privilege('anon','public.submit_tournament_payment_claim(uuid,integer,text,uuid,text)','EXECUTE')
    THEN v_msg := v_msg || 'anon gained claim RPC EXECUTE; '; END IF;

  IF v_msg <> '' THEN
    RAISE EXCEPTION 'PF1B_GRANTS_FAILED: %', v_msg;
  END IF;
END
$grants$;

COMMIT;
