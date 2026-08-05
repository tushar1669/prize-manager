begin;

-- F0d Migration B (D30/D31): UTR duplicate hard-block, submitted-vs-extracted
-- match, extraction ownership gate, and the concurrency backstop index.

-- 1. Canonical UTR form (D30). IMMUTABLE with schema-qualified builtins so it is
--    safe in an expression index and needs no SET search_path.
--    FROZEN once the index below exists: changing it requires
--    drop-index -> replace-function -> recreate-index.
create or replace function public.normalize_utr(p_utr text)
returns text
language sql
immutable
as $$
  select pg_catalog.upper(
    pg_catalog.regexp_replace(coalesce(p_utr, ''), '[^A-Za-z0-9]', '', 'g')
  )
$$;

revoke execute on function public.normalize_utr(text) from public;
revoke execute on function public.normalize_utr(text) from anon;
-- Deliberate N1 exception (D31): authenticated keeps EXECUTE because expression
-- index evaluation during DML runs as the invoking role. Pure string function.
grant execute on function public.normalize_utr(text) to authenticated, postgres, service_role;

-- 2. Concurrency backstop (D31). Closes the TOCTOU race between the EXISTS
--    check and the INSERT. Non-rejected only, so D15 resubmission still works.
create unique index if not exists uq_tournament_payments_utr_active
  on public.tournament_payments (public.normalize_utr(utr))
  where status <> 'rejected';

-- 3. The 5-arg claim RPC, with F0d checks added.
CREATE OR REPLACE FUNCTION public.submit_tournament_payment_claim(p_tournament_id uuid, p_amount_inr integer, p_utr text, p_screenshot_extraction_id uuid, p_return_to text)
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
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  v_is_master := public.has_role(v_user_id, 'master'::public.app_role);

  SELECT t.owner_id INTO v_owner_id FROM public.tournaments t
  WHERE t.id = p_tournament_id AND t.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT (v_owner_id = v_user_id OR v_is_master) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT price.amount_inr INTO v_canonical_amount
  FROM public.get_tournament_pro_price(p_tournament_id) price;

  IF v_canonical_amount = 0 THEN RAISE EXCEPTION 'TOURNAMENT_ALREADY_FREE'; END IF;
  IF p_utr IS NULL OR length(trim(p_utr)) < 6 THEN RAISE EXCEPTION 'INVALID_UTR'; END IF;

  SELECT cr.amount_after INTO v_expected_amount
  FROM public.coupon_redemptions cr
  WHERE cr.tournament_id = p_tournament_id
    AND cr.redeemed_by_user_id = v_user_id
    AND cr.amount_before = v_canonical_amount
    AND cr.amount_after > 0
    AND cr.amount_after < v_canonical_amount
    AND NOT EXISTS (
      SELECT 1 FROM public.tournament_entitlements te
      WHERE te.tournament_id = cr.tournament_id
        AND te.source = 'coupon'
        AND te.source_ref = cr.id
        AND now() >= te.starts_at
        AND now() < te.ends_at
    )
  ORDER BY cr.redeemed_at DESC
  LIMIT 1;

  v_expected_amount := COALESCE(v_expected_amount, v_canonical_amount);
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

  -- Duplicate hard-block. Rejected rows excluded so D15 resubmission with the
  -- same real UTR keeps working.
  IF EXISTS (
    SELECT 1 FROM public.tournament_payments tp
    WHERE tp.status <> 'rejected'
      AND public.normalize_utr(tp.utr) = v_utr_norm
  ) THEN
    RAISE EXCEPTION 'UTR_ALREADY_USED';
  END IF;

  -- Extraction gate + submitted-vs-extracted match. Only when a screenshot is
  -- linked; the UTR-only path is a deliberate valve (D1, D31).
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

    -- Fail closed: a cropped/unreadable UTR would otherwise pair with a freshly
    -- invented UTR on every attempt, blinding duplicate detection before F2.
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
$function$;

revoke execute on function public.submit_tournament_payment_claim(uuid, integer, text, uuid, text) from public;
revoke execute on function public.submit_tournament_payment_claim(uuid, integer, text, uuid, text) from anon;
grant execute on function public.submit_tournament_payment_claim(uuid, integer, text, uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
