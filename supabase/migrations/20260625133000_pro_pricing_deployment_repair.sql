-- Cycle M: canonical player-count based Pro pricing and payment/coupon hardening.
-- Forward-only, non-destructive: no payment, coupon redemption, or entitlement rows are mutated.

CREATE OR REPLACE FUNCTION public.get_tournament_pro_price(tournament_id uuid)
RETURNS TABLE (
  players_count integer,
  is_free_small_tournament boolean,
  amount_inr integer,
  tier_label text,
  free_player_threshold integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_players_count integer := 0;
  v_free_player_threshold CONSTANT integer := 150;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT t.owner_id INTO v_owner_id
  FROM public.tournaments t
  WHERE t.id = get_tournament_pro_price.tournament_id
    AND t.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND';
  END IF;

  IF NOT (v_owner_id = v_user_id OR public.has_role(v_user_id, 'master'::public.app_role)) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT COUNT(*)::integer INTO v_players_count
  FROM public.players p
  WHERE p.tournament_id = get_tournament_pro_price.tournament_id;

  players_count := v_players_count;
  free_player_threshold := v_free_player_threshold;

  IF v_players_count <= v_free_player_threshold THEN
    is_free_small_tournament := true;
    amount_inr := 0;
    tier_label := 'free_0_to_150';
  ELSIF v_players_count <= 500 THEN
    is_free_small_tournament := false;
    amount_inr := 500;
    tier_label := 'pro_151_to_500';
  ELSE
    is_free_small_tournament := false;
    amount_inr := 1000;
    tier_label := 'pro_501_plus';
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tournament_pro_price(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tournament_pro_price(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_tournament_access_state(tournament_id uuid)
RETURNS TABLE (
  has_full_access boolean,
  is_free_small_tournament boolean,
  players_count integer,
  preview_main_limit integer,
  free_player_threshold integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_players_count integer := 0;
  v_has_active_entitlement boolean := false;
  v_is_master boolean := false;
  v_free_player_threshold CONSTANT integer := 150;
BEGIN
  SELECT COUNT(*)::integer INTO v_players_count
  FROM public.players p
  WHERE p.tournament_id = get_tournament_access_state.tournament_id;

  SELECT EXISTS (
    SELECT 1 FROM public.tournament_entitlements te
    WHERE te.tournament_id = get_tournament_access_state.tournament_id
      AND now() >= te.starts_at
      AND now() < te.ends_at
  ) INTO v_has_active_entitlement;

  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'master'::public.app_role) THEN
    v_is_master := true;
  END IF;

  is_free_small_tournament := (v_players_count <= v_free_player_threshold);
  has_full_access := is_free_small_tournament OR v_has_active_entitlement;

  IF v_is_master THEN
    has_full_access := true;
    is_free_small_tournament := false;
    preview_main_limit := NULL;
  ELSE
    preview_main_limit := CASE WHEN has_full_access THEN NULL ELSE 8 END;
  END IF;

  players_count := v_players_count;
  free_player_threshold := v_free_player_threshold;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tournament_access_state(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_tournament_access_state(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tournament_access_state(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_tournament_payment_claim(p_tournament_id uuid, p_amount_inr integer, p_utr text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  INSERT INTO public.tournament_payments(tournament_id, user_id, amount_inr, utr, status)
  VALUES (p_tournament_id, v_user_id, p_amount_inr, trim(p_utr), 'pending')
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_tournament_payment_claim(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_tournament_payment_claim(uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_coupon_for_tournament(code text, tournament_id uuid, amount_before integer)
RETURNS TABLE (is_valid boolean, discount_amount integer, amount_after integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon public.coupons%ROWTYPE;
  v_discount integer := 0;
  v_after integer := 0;
  v_total_redemptions integer := 0;
  v_user_redemptions integer := 0;
  v_user_id uuid := auth.uid();
  v_canonical_amount integer := 0;
  v_now timestamptz := now();
  v_code text;
BEGIN
  IF v_user_id IS NULL THEN RETURN QUERY SELECT false, 0, GREATEST(COALESCE(amount_before, 0), 0), 'not_authenticated'::text; RETURN; END IF;

  SELECT price.amount_inr INTO v_canonical_amount FROM public.get_tournament_pro_price(apply_coupon_for_tournament.tournament_id) price;
  IF amount_before IS NULL OR amount_before < 0 THEN RETURN QUERY SELECT false, 0, v_canonical_amount, 'invalid_amount_before'::text; RETURN; END IF;
  IF amount_before IS DISTINCT FROM v_canonical_amount THEN RETURN QUERY SELECT false, 0, v_canonical_amount, 'amount_before_mismatch'::text; RETURN; END IF;
  IF v_canonical_amount = 0 THEN RETURN QUERY SELECT false, 0, 0, 'already_free'::text; RETURN; END IF;

  v_code := upper(trim(code));
  IF v_code IS NULL OR v_code = '' THEN RETURN QUERY SELECT false, 0, v_canonical_amount, 'missing_code'::text; RETURN; END IF;

  SELECT * INTO v_coupon FROM public.coupons c WHERE c.code = v_code AND c.applies_to = 'tournament_pro';
  IF NOT FOUND THEN RETURN QUERY SELECT false, 0, v_canonical_amount, 'coupon_not_found'::text; RETURN; END IF;
  IF NOT v_coupon.is_active THEN RETURN QUERY SELECT false, 0, v_canonical_amount, 'coupon_inactive'::text; RETURN; END IF;
  IF v_coupon.starts_at IS NOT NULL AND v_now < v_coupon.starts_at THEN RETURN QUERY SELECT false, 0, v_canonical_amount, 'coupon_not_started'::text; RETURN; END IF;
  IF v_coupon.ends_at IS NOT NULL AND v_now > v_coupon.ends_at THEN RETURN QUERY SELECT false, 0, v_canonical_amount, 'coupon_expired'::text; RETURN; END IF;
  IF v_coupon.issued_to_user_id IS NOT NULL AND v_coupon.issued_to_user_id <> v_user_id THEN RETURN QUERY SELECT false, 0, v_canonical_amount, 'coupon_not_issued_to_user'::text; RETURN; END IF;

  SELECT COUNT(*) INTO v_total_redemptions FROM public.coupon_redemptions cr WHERE cr.coupon_id = v_coupon.id;
  IF v_coupon.max_redemptions IS NOT NULL AND v_total_redemptions >= v_coupon.max_redemptions THEN RETURN QUERY SELECT false, 0, v_canonical_amount, 'max_redemptions_reached'::text; RETURN; END IF;
  SELECT COUNT(*) INTO v_user_redemptions FROM public.coupon_redemptions cr WHERE cr.coupon_id = v_coupon.id AND cr.redeemed_by_user_id = v_user_id;
  IF v_coupon.max_redemptions_per_user IS NOT NULL AND v_user_redemptions >= v_coupon.max_redemptions_per_user THEN RETURN QUERY SELECT false, 0, v_canonical_amount, 'max_redemptions_per_user_reached'::text; RETURN; END IF;

  IF v_coupon.discount_type = 'percent' THEN
    v_discount := floor((v_canonical_amount::numeric * v_coupon.discount_value::numeric) / 100.0)::integer;
  ELSIF v_coupon.discount_type = 'amount' THEN
    v_discount := LEAST(v_canonical_amount, v_coupon.discount_value);
  ELSIF v_coupon.discount_type = 'fixed_price' THEN
    v_after := LEAST(v_canonical_amount, v_coupon.discount_value);
    v_discount := v_canonical_amount - v_after;
  ELSE
    RETURN QUERY SELECT false, 0, v_canonical_amount, 'invalid_discount_type'::text; RETURN;
  END IF;

  v_discount := GREATEST(0, LEAST(v_discount, v_canonical_amount));
  v_after := v_canonical_amount - v_discount;
  RETURN QUERY SELECT true, v_discount, v_after, 'valid'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_coupon_for_tournament(code text, tournament_id uuid, amount_before integer)
RETURNS TABLE(amount_after integer, discount_amount integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon public.coupons%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_discount integer := 0;
  v_after integer := 0;
  v_total integer := 0;
  v_user_total integer := 0;
  v_code text;
  v_owner_id uuid;
  v_redemption_id uuid;
  v_now timestamptz := now();
  v_canonical_amount integer := 0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT t.owner_id INTO v_owner_id FROM public.tournaments t WHERE t.id = redeem_coupon_for_tournament.tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament_not_found'; END IF;
  IF NOT (v_owner_id = v_user_id OR public.has_role(v_user_id,'master'::public.app_role)) THEN RAISE EXCEPTION 'not_authorized_for_tournament'; END IF;

  SELECT price.amount_inr INTO v_canonical_amount FROM public.get_tournament_pro_price(redeem_coupon_for_tournament.tournament_id) price;
  IF amount_before IS NULL OR amount_before < 0 THEN RAISE EXCEPTION 'invalid_amount_before'; END IF;
  IF amount_before IS DISTINCT FROM v_canonical_amount THEN RAISE EXCEPTION 'amount_before_mismatch'; END IF;
  IF v_canonical_amount = 0 THEN RAISE EXCEPTION 'already_free'; END IF;

  v_code := upper(trim(code));
  IF v_code IS NULL OR v_code = '' THEN RAISE EXCEPTION 'missing_code'; END IF;

  SELECT * INTO v_coupon FROM public.coupons c WHERE c.code = v_code AND c.applies_to='tournament_pro' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'coupon_not_found'; END IF;
  IF NOT v_coupon.is_active THEN RAISE EXCEPTION 'coupon_inactive'; END IF;
  IF v_coupon.starts_at IS NOT NULL AND v_now < v_coupon.starts_at THEN RAISE EXCEPTION 'coupon_not_started'; END IF;
  IF v_coupon.ends_at IS NOT NULL AND v_now > v_coupon.ends_at THEN RAISE EXCEPTION 'coupon_expired'; END IF;
  IF v_coupon.issued_to_user_id IS NOT NULL AND v_coupon.issued_to_user_id <> v_user_id THEN RAISE EXCEPTION 'coupon_not_issued_to_user'; END IF;

  SELECT count(*) INTO v_total FROM public.coupon_redemptions cr WHERE cr.coupon_id = v_coupon.id;
  IF v_coupon.max_redemptions IS NOT NULL AND v_total >= v_coupon.max_redemptions THEN RAISE EXCEPTION 'max_redemptions_reached'; END IF;
  SELECT count(*) INTO v_user_total FROM public.coupon_redemptions cr WHERE cr.coupon_id = v_coupon.id AND cr.redeemed_by_user_id = v_user_id;
  IF v_coupon.max_redemptions_per_user IS NOT NULL AND v_user_total >= v_coupon.max_redemptions_per_user THEN RAISE EXCEPTION 'max_redemptions_per_user_reached'; END IF;

  IF v_coupon.discount_type = 'percent' THEN
    v_discount := floor((v_canonical_amount::numeric * v_coupon.discount_value::numeric)/100.0)::integer;
  ELSIF v_coupon.discount_type = 'amount' THEN
    v_discount := least(v_canonical_amount, v_coupon.discount_value);
  ELSIF v_coupon.discount_type = 'fixed_price' THEN
    v_after := least(v_canonical_amount, v_coupon.discount_value);
    v_discount := v_canonical_amount - v_after;
  ELSE
    RAISE EXCEPTION 'invalid_discount_type';
  END IF;

  v_discount := greatest(0, least(v_discount, v_canonical_amount));
  v_after := v_canonical_amount - v_discount;

  INSERT INTO public.coupon_redemptions(coupon_id, redeemed_by_user_id, issued_to_user_id, issued_to_email, tournament_id, amount_before, discount_amount, amount_after, meta)
  VALUES(v_coupon.id, v_user_id, v_coupon.issued_to_user_id, v_coupon.issued_to_email, redeem_coupon_for_tournament.tournament_id, v_canonical_amount, v_discount, v_after, jsonb_build_object('code', v_coupon.code, 'applies_to', v_coupon.applies_to, 'source', 'redeem_coupon_for_tournament'))
  RETURNING id INTO v_redemption_id;

  IF v_after = 0 THEN
    INSERT INTO public.tournament_entitlements(tournament_id, owner_id, source, source_ref, starts_at, ends_at)
    VALUES (redeem_coupon_for_tournament.tournament_id, v_owner_id, 'coupon', v_redemption_id, v_now, v_now + interval '365 days');
    PERFORM public.issue_referral_rewards(v_user_id, redeem_coupon_for_tournament.tournament_id);
  END IF;

  RETURN QUERY SELECT v_after, v_discount, 'redeemed'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_coupon_for_tournament(text, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_coupon_for_tournament(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_coupon_for_tournament(text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon_for_tournament(text, uuid, integer) TO authenticated;
