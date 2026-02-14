-- Canonical tournament entitlement + access resolver hardening

-- 1) Ensure tournament entitlements table exists in prod even if prior migration was skipped.
CREATE TABLE IF NOT EXISTS public.tournament_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  source text NOT NULL,
  source_ref uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_entitlements_source_check CHECK (source IN ('payment', 'coupon')),
  CONSTRAINT tournament_entitlements_window_valid CHECK (starts_at < ends_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS tournaments_id_owner_id_unique
  ON public.tournaments (id, owner_id);

ALTER TABLE public.tournament_entitlements
  DROP CONSTRAINT IF EXISTS tournament_entitlements_tournament_owner_fkey,
  ADD CONSTRAINT tournament_entitlements_tournament_owner_fkey
    FOREIGN KEY (tournament_id, owner_id)
    REFERENCES public.tournaments(id, owner_id)
    ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS tournament_entitlements_tournament_id_idx
  ON public.tournament_entitlements (tournament_id);
CREATE INDEX IF NOT EXISTS tournament_entitlements_owner_id_idx
  ON public.tournament_entitlements (owner_id);
CREATE INDEX IF NOT EXISTS tournament_entitlements_active_window_idx
  ON public.tournament_entitlements (tournament_id, starts_at, ends_at DESC);

ALTER TABLE public.tournament_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tournament_entitlements_select_own_or_master ON public.tournament_entitlements;
CREATE POLICY tournament_entitlements_select_own_or_master
ON public.tournament_entitlements
FOR SELECT
TO authenticated
USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'master'::public.app_role));

DROP POLICY IF EXISTS tournament_entitlements_insert_master_only ON public.tournament_entitlements;
CREATE POLICY tournament_entitlements_insert_master_only
ON public.tournament_entitlements
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'master'::public.app_role));

DROP POLICY IF EXISTS tournament_entitlements_update_master_only ON public.tournament_entitlements;
CREATE POLICY tournament_entitlements_update_master_only
ON public.tournament_entitlements
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'master'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'master'::public.app_role));

DROP POLICY IF EXISTS tournament_entitlements_delete_master_only ON public.tournament_entitlements;
CREATE POLICY tournament_entitlements_delete_master_only
ON public.tournament_entitlements
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'master'::public.app_role));

-- 2) Coupon RPCs: keep ownership + locking behavior, pin 30-day entitlement duration.
DROP FUNCTION IF EXISTS public.apply_coupon_for_tournament(text, uuid, integer);
CREATE OR REPLACE FUNCTION public.apply_coupon_for_tournament(
  code text,
  tournament_id uuid,
  amount_before integer
)
RETURNS TABLE (
  is_valid boolean,
  discount_amount integer,
  amount_after integer,
  reason text
)
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
  v_user_id uuid;
  v_owner_id uuid;
  v_now timestamptz := now();
  v_code text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, 0, GREATEST(COALESCE(amount_before, 0), 0), 'not_authenticated'::text;
    RETURN;
  END IF;

  IF amount_before IS NULL OR amount_before < 0 THEN
    RETURN QUERY SELECT false, 0, 0, 'invalid_amount_before'::text;
    RETURN;
  END IF;

  SELECT t.owner_id
  INTO v_owner_id
  FROM public.tournaments t
  WHERE t.id = apply_coupon_for_tournament.tournament_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, amount_before, 'tournament_not_found'::text;
    RETURN;
  END IF;

  IF NOT (
    v_owner_id = v_user_id
    OR public.has_role(v_user_id, 'master'::public.app_role)
  ) THEN
    RETURN QUERY SELECT false, 0, amount_before, 'not_authorized_for_tournament'::text;
    RETURN;
  END IF;

  v_code := upper(trim(code));
  IF v_code IS NULL OR v_code = '' THEN
    RETURN QUERY SELECT false, 0, amount_before, 'missing_code'::text;
    RETURN;
  END IF;

  SELECT *
  INTO v_coupon
  FROM public.coupons c
  WHERE c.code = v_code
    AND c.applies_to = 'tournament_pro';

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, amount_before, 'coupon_not_found'::text;
    RETURN;
  END IF;

  IF NOT v_coupon.is_active THEN
    RETURN QUERY SELECT false, 0, amount_before, 'coupon_inactive'::text;
    RETURN;
  END IF;

  IF v_coupon.starts_at IS NOT NULL AND v_now < v_coupon.starts_at THEN
    RETURN QUERY SELECT false, 0, amount_before, 'coupon_not_started'::text;
    RETURN;
  END IF;

  IF v_coupon.ends_at IS NOT NULL AND v_now > v_coupon.ends_at THEN
    RETURN QUERY SELECT false, 0, amount_before, 'coupon_expired'::text;
    RETURN;
  END IF;

  IF v_coupon.issued_to_user_id IS NOT NULL AND v_coupon.issued_to_user_id <> v_user_id THEN
    RETURN QUERY SELECT false, 0, amount_before, 'coupon_not_issued_to_user'::text;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_total_redemptions
  FROM public.coupon_redemptions cr
  WHERE cr.coupon_id = v_coupon.id;

  IF v_coupon.max_redemptions IS NOT NULL AND v_total_redemptions >= v_coupon.max_redemptions THEN
    RETURN QUERY SELECT false, 0, amount_before, 'max_redemptions_reached'::text;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_user_redemptions
  FROM public.coupon_redemptions cr
  WHERE cr.coupon_id = v_coupon.id
    AND cr.redeemed_by_user_id = v_user_id;

  IF v_coupon.max_redemptions_per_user IS NOT NULL AND v_user_redemptions >= v_coupon.max_redemptions_per_user THEN
    RETURN QUERY SELECT false, 0, amount_before, 'max_redemptions_per_user_reached'::text;
    RETURN;
  END IF;

  IF v_coupon.discount_type = 'percent' THEN
    v_discount := floor((amount_before::numeric * v_coupon.discount_value::numeric) / 100.0)::integer;
  ELSIF v_coupon.discount_type = 'amount' THEN
    v_discount := LEAST(amount_before, v_coupon.discount_value);
  ELSIF v_coupon.discount_type = 'fixed_price' THEN
    v_after := LEAST(amount_before, v_coupon.discount_value);
    v_discount := amount_before - v_after;
  ELSE
    RETURN QUERY SELECT false, 0, amount_before, 'invalid_discount_type'::text;
    RETURN;
  END IF;

  v_discount := GREATEST(0, LEAST(v_discount, amount_before));
  v_after := amount_before - v_discount;

  RETURN QUERY SELECT true, v_discount, v_after, 'valid'::text;
END;
$$;

DROP FUNCTION IF EXISTS public.redeem_coupon_for_tournament(text, uuid, integer);
CREATE OR REPLACE FUNCTION public.redeem_coupon_for_tournament(
  code text,
  tournament_id uuid,
  amount_before integer
)
RETURNS TABLE (
  amount_after integer,
  discount_amount integer,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon public.coupons%ROWTYPE;
  v_user_id uuid;
  v_discount integer := 0;
  v_after integer := 0;
  v_total_redemptions integer := 0;
  v_user_redemptions integer := 0;
  v_code text;
  v_owner_id uuid;
  v_redemption_id uuid;
  v_now timestamptz := now();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF amount_before IS NULL OR amount_before < 0 THEN
    RAISE EXCEPTION 'invalid_amount_before';
  END IF;

  SELECT t.owner_id
  INTO v_owner_id
  FROM public.tournaments t
  WHERE t.id = redeem_coupon_for_tournament.tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament_not_found';
  END IF;

  IF NOT (
    v_owner_id = v_user_id
    OR public.has_role(v_user_id, 'master'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'not_authorized_for_tournament';
  END IF;

  v_code := upper(trim(code));
  IF v_code IS NULL OR v_code = '' THEN
    RAISE EXCEPTION 'missing_code';
  END IF;

  SELECT *
  INTO v_coupon
  FROM public.coupons c
  WHERE c.code = v_code
    AND c.applies_to = 'tournament_pro'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coupon_not_found';
  END IF;

  IF NOT v_coupon.is_active THEN
    RAISE EXCEPTION 'coupon_inactive';
  END IF;

  IF v_coupon.starts_at IS NOT NULL AND v_now < v_coupon.starts_at THEN
    RAISE EXCEPTION 'coupon_not_started';
  END IF;

  IF v_coupon.ends_at IS NOT NULL AND v_now > v_coupon.ends_at THEN
    RAISE EXCEPTION 'coupon_expired';
  END IF;

  IF v_coupon.issued_to_user_id IS NOT NULL AND v_coupon.issued_to_user_id <> v_user_id THEN
    RAISE EXCEPTION 'coupon_not_issued_to_user';
  END IF;

  SELECT COUNT(*) INTO v_total_redemptions
  FROM public.coupon_redemptions cr
  WHERE cr.coupon_id = v_coupon.id;

  IF v_coupon.max_redemptions IS NOT NULL AND v_total_redemptions >= v_coupon.max_redemptions THEN
    RAISE EXCEPTION 'max_redemptions_reached';
  END IF;

  SELECT COUNT(*) INTO v_user_redemptions
  FROM public.coupon_redemptions cr
  WHERE cr.coupon_id = v_coupon.id
    AND cr.redeemed_by_user_id = v_user_id;

  IF v_coupon.max_redemptions_per_user IS NOT NULL AND v_user_redemptions >= v_coupon.max_redemptions_per_user THEN
    RAISE EXCEPTION 'max_redemptions_per_user_reached';
  END IF;

  IF v_coupon.discount_type = 'percent' THEN
    v_discount := floor((amount_before::numeric * v_coupon.discount_value::numeric) / 100.0)::integer;
  ELSIF v_coupon.discount_type = 'amount' THEN
    v_discount := LEAST(amount_before, v_coupon.discount_value);
  ELSIF v_coupon.discount_type = 'fixed_price' THEN
    v_after := LEAST(amount_before, v_coupon.discount_value);
    v_discount := amount_before - v_after;
  ELSE
    RAISE EXCEPTION 'invalid_discount_type';
  END IF;

  v_discount := GREATEST(0, LEAST(v_discount, amount_before));
  v_after := amount_before - v_discount;

  INSERT INTO public.coupon_redemptions (
    coupon_id,
    redeemed_by_user_id,
    issued_to_user_id,
    issued_to_email,
    tournament_id,
    amount_before,
    discount_amount,
    amount_after,
    meta
  ) VALUES (
    v_coupon.id,
    v_user_id,
    v_coupon.issued_to_user_id,
    v_coupon.issued_to_email,
    redeem_coupon_for_tournament.tournament_id,
    amount_before,
    v_discount,
    v_after,
    jsonb_build_object(
      'code', v_coupon.code,
      'applies_to', v_coupon.applies_to,
      'source', 'redeem_coupon_for_tournament'
    )
  )
  RETURNING id INTO v_redemption_id;

  IF v_after = 0 THEN
    INSERT INTO public.tournament_entitlements (
      tournament_id,
      owner_id,
      source,
      source_ref,
      starts_at,
      ends_at
    ) VALUES (
      redeem_coupon_for_tournament.tournament_id,
      v_owner_id,
      'coupon',
      v_redemption_id,
      v_now,
      v_now + interval '30 days'
    );
  END IF;

  RETURN QUERY SELECT v_after, v_discount, 'redeemed'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_coupon_for_tournament(text, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_coupon_for_tournament(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_coupon_for_tournament(text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon_for_tournament(text, uuid, integer) TO authenticated;

-- 3) Canonical server-truth resolver
DROP FUNCTION IF EXISTS public.get_tournament_access_state(uuid);
CREATE OR REPLACE FUNCTION public.get_tournament_access_state(tournament_id uuid)
RETURNS TABLE (
  has_full_access boolean,
  is_free_small_tournament boolean,
  players_count integer,
  preview_main_limit integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_players_count integer := 0;
  v_has_active_entitlement boolean := false;
BEGIN
  SELECT COUNT(*)::integer
  INTO v_players_count
  FROM public.players p
  WHERE p.tournament_id = get_tournament_access_state.tournament_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.tournament_entitlements te
    WHERE te.tournament_id = get_tournament_access_state.tournament_id
      AND now() >= te.starts_at
      AND now() < te.ends_at
  )
  INTO v_has_active_entitlement;

  has_full_access := (v_players_count <= 100) OR v_has_active_entitlement;
  is_free_small_tournament := (v_players_count <= 100);
  players_count := v_players_count;
  preview_main_limit := CASE WHEN has_full_access THEN NULL ELSE 8 END;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tournament_access_state(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tournament_access_state(uuid) TO anon, authenticated, service_role;

-- Helper RPC used by public results page so preview rules are enforceable server-side.
DROP FUNCTION IF EXISTS public.get_public_tournament_results(uuid);
CREATE OR REPLACE FUNCTION public.get_public_tournament_results(tournament_id uuid)
RETURNS TABLE (
  prize_id uuid,
  player_name text,
  rank integer,
  rating integer,
  state text,
  category_name text,
  is_main boolean,
  place integer,
  cash_amount integer,
  has_trophy boolean,
  has_medal boolean,
  has_full_access boolean,
  preview_main_limit integer,
  other_categories_locked boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH access_state AS (
  SELECT *
  FROM public.get_tournament_access_state(get_public_tournament_results.tournament_id)
),
latest_version AS (
  SELECT MAX(a.version) AS version
  FROM public.allocations a
  WHERE a.tournament_id = get_public_tournament_results.tournament_id
),
base_rows AS (
  SELECT
    a.prize_id,
    COALESCE(NULLIF(TRIM(p.full_name), ''), p.name, 'Unknown') AS player_name,
    p.rank,
    p.rating,
    p.state,
    c.name AS category_name,
    COALESCE(c.is_main, false) AS is_main,
    pr.place,
    COALESCE(pr.cash_amount, 0)::integer AS cash_amount,
    COALESCE(pr.has_trophy, false) AS has_trophy,
    COALESCE(pr.has_medal, false) AS has_medal,
    ROW_NUMBER() OVER (PARTITION BY pr.category_id ORDER BY pr.place ASC, a.prize_id ASC) AS main_rank
  FROM public.allocations a
  JOIN latest_version lv ON lv.version = a.version
  JOIN public.prizes pr ON pr.id = a.prize_id
  JOIN public.categories c ON c.id = pr.category_id
  LEFT JOIN public.players p ON p.id = a.player_id
  WHERE a.tournament_id = get_public_tournament_results.tournament_id
    AND a.player_id IS NOT NULL
)
SELECT
  b.prize_id,
  b.player_name,
  b.rank,
  b.rating,
  b.state,
  b.category_name,
  b.is_main,
  b.place,
  b.cash_amount,
  b.has_trophy,
  b.has_medal,
  s.has_full_access,
  s.preview_main_limit,
  NOT s.has_full_access AS other_categories_locked
FROM base_rows b
CROSS JOIN access_state s
WHERE s.has_full_access
   OR (
     s.has_full_access = false
     AND b.is_main = true
     AND b.main_rank <= COALESCE(s.preview_main_limit, 0)
   )
ORDER BY
  b.is_main DESC,
  b.place ASC,
  b.prize_id ASC;
$$;

REVOKE ALL ON FUNCTION public.get_public_tournament_results(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tournament_results(uuid) TO anon, authenticated, service_role;
