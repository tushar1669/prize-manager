-- Coupons + redemption auditing + storage path policy alignment

CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'amount', 'fixed_price')),
  discount_value integer NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  applies_to_plan_slug text NOT NULL DEFAULT 'pro',
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  max_redemptions integer NULL,
  max_redemptions_per_user integer NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupons_code_uppercase CHECK (code = upper(code)),
  CONSTRAINT coupons_discount_value_valid CHECK (
    (discount_type = 'percent' AND discount_value BETWEEN 0 AND 100)
    OR (discount_type IN ('amount', 'fixed_price') AND discount_value >= 0)
  ),
  CONSTRAINT coupons_window_valid CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at <= ends_at),
  CONSTRAINT coupons_max_redemptions_valid CHECK (max_redemptions IS NULL OR max_redemptions >= 1),
  CONSTRAINT coupons_max_redemptions_per_user_valid CHECK (max_redemptions_per_user IS NULL OR max_redemptions_per_user >= 1)
);

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  subscription_id uuid NULL REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  amount_before integer NOT NULL,
  discount_amount integer NOT NULL,
  amount_after integer NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT coupon_redemptions_amounts_valid CHECK (
    amount_before >= 0
    AND discount_amount >= 0
    AND amount_after >= 0
    AND amount_after = amount_before - discount_amount
  )
);

CREATE INDEX IF NOT EXISTS coupons_code_idx ON public.coupons (code);
CREATE INDEX IF NOT EXISTS coupon_redemptions_redeemed_at_idx ON public.coupon_redemptions (redeemed_at DESC);
CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_id_idx ON public.coupon_redemptions (coupon_id);
CREATE INDEX IF NOT EXISTS coupon_redemptions_user_id_idx ON public.coupon_redemptions (user_id);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coupons_select_authenticated ON public.coupons;
CREATE POLICY coupons_select_authenticated
ON public.coupons
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS coupons_insert_master ON public.coupons;
CREATE POLICY coupons_insert_master
ON public.coupons
FOR INSERT
TO authenticated
WITH CHECK (public.is_master());

DROP POLICY IF EXISTS coupons_update_master ON public.coupons;
CREATE POLICY coupons_update_master
ON public.coupons
FOR UPDATE
TO authenticated
USING (public.is_master())
WITH CHECK (public.is_master());

DROP POLICY IF EXISTS coupons_delete_master ON public.coupons;
CREATE POLICY coupons_delete_master
ON public.coupons
FOR DELETE
TO authenticated
USING (public.is_master());

DROP POLICY IF EXISTS coupon_redemptions_select_own_or_master ON public.coupon_redemptions;
CREATE POLICY coupon_redemptions_select_own_or_master
ON public.coupon_redemptions
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_master());

CREATE OR REPLACE FUNCTION public.apply_coupon(
  code text,
  plan_slug text,
  amount_before integer
)
RETURNS TABLE (
  is_valid boolean,
  discount_amount integer,
  amount_after integer,
  reason text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_coupon public.coupons%ROWTYPE;
  v_discount integer := 0;
  v_after integer := 0;
  v_total_redemptions integer := 0;
  v_user_redemptions integer := 0;
  v_user_id uuid;
  v_code text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, 0, GREATEST(amount_before, 0), 'not_authenticated'::text;
    RETURN;
  END IF;

  IF amount_before IS NULL OR amount_before < 0 THEN
    RETURN QUERY SELECT false, 0, 0, 'invalid_amount_before'::text;
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
  WHERE c.code = v_code;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, amount_before, 'coupon_not_found'::text;
    RETURN;
  END IF;

  IF NOT v_coupon.is_active THEN
    RETURN QUERY SELECT false, 0, amount_before, 'coupon_inactive'::text;
    RETURN;
  END IF;

  IF v_coupon.applies_to_plan_slug <> plan_slug THEN
    RETURN QUERY SELECT false, 0, amount_before, 'coupon_not_applicable_to_plan'::text;
    RETURN;
  END IF;

  IF v_coupon.starts_at IS NOT NULL AND now() < v_coupon.starts_at THEN
    RETURN QUERY SELECT false, 0, amount_before, 'coupon_not_started'::text;
    RETURN;
  END IF;

  IF v_coupon.ends_at IS NOT NULL AND now() > v_coupon.ends_at THEN
    RETURN QUERY SELECT false, 0, amount_before, 'coupon_expired'::text;
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
    AND cr.user_id = v_user_id;

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

CREATE OR REPLACE FUNCTION public.redeem_coupon(
  code text,
  plan_slug text,
  amount_before integer,
  subscription_id uuid
)
RETURNS TABLE (
  amount_after integer,
  discount_amount integer
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF amount_before IS NULL OR amount_before < 0 THEN
    RAISE EXCEPTION 'invalid_amount_before';
  END IF;

  v_code := upper(trim(code));
  IF v_code IS NULL OR v_code = '' THEN
    RAISE EXCEPTION 'missing_code';
  END IF;

  SELECT *
  INTO v_coupon
  FROM public.coupons c
  WHERE c.code = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coupon_not_found';
  END IF;

  IF NOT v_coupon.is_active THEN
    RAISE EXCEPTION 'coupon_inactive';
  END IF;

  IF v_coupon.applies_to_plan_slug <> plan_slug THEN
    RAISE EXCEPTION 'coupon_not_applicable_to_plan';
  END IF;

  IF v_coupon.starts_at IS NOT NULL AND now() < v_coupon.starts_at THEN
    RAISE EXCEPTION 'coupon_not_started';
  END IF;

  IF v_coupon.ends_at IS NOT NULL AND now() > v_coupon.ends_at THEN
    RAISE EXCEPTION 'coupon_expired';
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
    AND cr.user_id = v_user_id;

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
    user_id,
    subscription_id,
    amount_before,
    discount_amount,
    amount_after,
    meta
  )
  VALUES (
    v_coupon.id,
    v_user_id,
    redeem_coupon.subscription_id,
    amount_before,
    v_discount,
    v_after,
    jsonb_build_object('code', v_coupon.code, 'plan_slug', plan_slug)
  );

  IF v_after = 0 THEN
    IF to_regclass('public.payments') IS NULL THEN
      RAISE EXCEPTION 'payments_table_missing';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_attribute
      WHERE attrelid = 'public.payments'::regclass
        AND attname = 'metadata'
        AND NOT attisdropped
    ) THEN
      EXECUTE $sql$
        INSERT INTO public.payments (
          subscription_id,
          amount,
          status,
          payment_method,
          payment_reference,
          metadata
        ) VALUES ($1, 0, 'verified', 'coupon', $2, $3)
      $sql$
      USING redeem_coupon.subscription_id,
            v_coupon.code,
            jsonb_build_object('coupon_code', v_coupon.code, 'discount_amount', v_discount);
    ELSE
      EXECUTE $sql$
        INSERT INTO public.payments (
          subscription_id,
          amount,
          status,
          payment_method,
          payment_reference,
          meta
        ) VALUES ($1, 0, 'verified', 'coupon', $2, $3)
      $sql$
      USING redeem_coupon.subscription_id,
            v_coupon.code,
            jsonb_build_object('coupon_code', v_coupon.code, 'discount_amount', v_discount);
    END IF;
  END IF;

  RETURN QUERY SELECT v_after, v_discount;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_coupon(text, text, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_coupon(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon(text, text, integer, uuid) TO authenticated;

-- Storage policy path + authorization alignment for brochures/{tournament_id}/... and exports/{tournament_id}/...
DROP POLICY IF EXISTS "Organizers upload brochures" ON storage.objects;
DROP POLICY IF EXISTS "Organizers read own brochures" ON storage.objects;
DROP POLICY IF EXISTS "Public read published brochures" ON storage.objects;
DROP POLICY IF EXISTS "Organizers upload exports" ON storage.objects;
DROP POLICY IF EXISTS "Organizers read own exports" ON storage.objects;
DROP POLICY IF EXISTS "Public read published exports" ON storage.objects;

CREATE POLICY "Organizers upload brochures"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'brochures'
  AND EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND (t.owner_id = auth.uid() OR public.is_master())
  )
);

CREATE POLICY "Organizers read own brochures"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'brochures'
  AND EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND (t.owner_id = auth.uid() OR public.is_master())
  )
);

CREATE POLICY "Public read published brochures"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'brochures'
  AND EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND t.is_published = true
      AND t.deleted_at IS NULL
  )
);

CREATE POLICY "Organizers upload exports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'exports'
  AND EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND (t.owner_id = auth.uid() OR public.is_master())
  )
);

CREATE POLICY "Organizers read own exports"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'exports'
  AND EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND (t.owner_id = auth.uid() OR public.is_master())
  )
);

CREATE POLICY "Public read published exports"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'exports'
  AND EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND t.is_published = true
      AND t.deleted_at IS NULL
  )
);
