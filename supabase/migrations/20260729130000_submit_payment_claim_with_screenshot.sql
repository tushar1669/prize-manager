-- NEW 4-arg overload. The existing 3-arg function is left intact and still works.
-- The new param has NO default, so PostgREST resolves the two unambiguously.
-- Body is identical to the 3-arg version except for the screenshot column.
CREATE OR REPLACE FUNCTION public.submit_tournament_payment_claim(
  p_tournament_id uuid,
  p_amount_inr integer,
  p_utr text,
  p_screenshot_extraction_id uuid
)
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
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT t.owner_id INTO v_owner_id FROM public.tournaments t
  WHERE t.id = p_tournament_id AND t.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT (v_owner_id = v_user_id OR public.has_role(v_user_id, 'master'::public.app_role)) THEN
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

  INSERT INTO public.tournament_payments(
    tournament_id, user_id, amount_inr, utr, status, screenshot_extraction_id)
  VALUES (
    p_tournament_id, v_user_id, p_amount_inr, trim(p_utr), 'pending', p_screenshot_extraction_id)
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$function$;
