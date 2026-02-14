-- Canonical coupon + redemption + tournament entitlement convergence
-- Uses integer minor units (paise/cents) for all monetary fields.

-- 1) Ensure coupons table exists (for environments where drift omitted repo migration)
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL,
  discount_value integer NOT NULL,
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  max_redemptions integer NULL,
  max_redemptions_per_user integer NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  applies_to text NOT NULL DEFAULT 'tournament_pro',
  issued_to_user_id uuid NULL,
  issued_to_email text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Converge coupons schema in-place
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS applies_to text,
  ADD COLUMN IF NOT EXISTS issued_to_user_id uuid,
  ADD COLUMN IF NOT EXISTS issued_to_email text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_redemptions integer,
  ADD COLUMN IF NOT EXISTS max_redemptions_per_user integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'coupons'
      AND column_name = 'applies_to_plan_slug'
  ) THEN
    EXECUTE $$UPDATE public.coupons SET applies_to = COALESCE(applies_to, applies_to_plan_slug, 'tournament_pro')$$;
  ELSE
    EXECUTE $$UPDATE public.coupons SET applies_to = COALESCE(applies_to, 'tournament_pro')$$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'coupons'
      AND column_name = 'currency'
  ) THEN
    EXECUTE $$ALTER TABLE public.coupons DROP COLUMN IF EXISTS currency$$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'coupons'
      AND column_name = 'updated_at'
  ) THEN
    EXECUTE $$ALTER TABLE public.coupons DROP COLUMN IF EXISTS updated_at$$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'coupons'
      AND column_name = 'applies_to_plan_slug'
  ) THEN
    EXECUTE $$ALTER TABLE public.coupons DROP COLUMN IF EXISTS applies_to_plan_slug$$;
  END IF;
END
$$;

UPDATE public.coupons
SET code = upper(trim(code))
WHERE code IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'coupons'
      AND column_name = 'discount_value'
      AND data_type <> 'integer'
  ) THEN
    ALTER TABLE public.coupons
      ALTER COLUMN discount_value TYPE integer
      USING round(discount_value::numeric)::integer;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'coupons'
      AND column_name = 'discount_type'
  ) THEN
    UPDATE public.coupons
    SET discount_type = CASE discount_type
      WHEN 'percentage' THEN 'percent'
      WHEN 'fixed' THEN 'amount'
      ELSE discount_type
    END;
  END IF;
END
$$;

ALTER TABLE public.coupons
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN discount_type SET NOT NULL,
  ALTER COLUMN discount_value SET NOT NULL,
  ALTER COLUMN applies_to SET NOT NULL,
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.coupons
  ALTER COLUMN applies_to SET DEFAULT 'tournament_pro',
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN max_redemptions_per_user SET DEFAULT 1,
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.coupons
  DROP CONSTRAINT IF EXISTS coupons_discount_type_check,
  DROP CONSTRAINT IF EXISTS coupons_discount_value_positive,
  DROP CONSTRAINT IF EXISTS coupons_code_uppercase,
  DROP CONSTRAINT IF EXISTS coupons_discount_value_valid,
  DROP CONSTRAINT IF EXISTS coupons_window_valid,
  DROP CONSTRAINT IF EXISTS coupons_max_redemptions_valid,
  DROP CONSTRAINT IF EXISTS coupons_max_redemptions_per_user_valid,
  DROP CONSTRAINT IF EXISTS coupons_applies_to_check;

ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_code_uppercase CHECK (code = upper(code)),
  ADD CONSTRAINT coupons_discount_value_valid CHECK (
    (discount_type = 'percent' AND discount_value BETWEEN 0 AND 100)
    OR (discount_type IN ('amount', 'fixed_price') AND discount_value >= 0)
  ),
  ADD CONSTRAINT coupons_window_valid CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at <= ends_at),
  ADD CONSTRAINT coupons_max_redemptions_valid CHECK (max_redemptions IS NULL OR max_redemptions >= 1),
  ADD CONSTRAINT coupons_max_redemptions_per_user_valid CHECK (max_redemptions_per_user IS NULL OR max_redemptions_per_user >= 1),
  ADD CONSTRAINT coupons_applies_to_check CHECK (applies_to = 'tournament_pro');

CREATE OR REPLACE FUNCTION public.normalize_coupon_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.code := upper(trim(NEW.code));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_coupon_code ON public.coupons;
CREATE TRIGGER normalize_coupon_code
BEFORE INSERT OR UPDATE ON public.coupons
FOR EACH ROW
EXECUTE FUNCTION public.normalize_coupon_code();

CREATE INDEX IF NOT EXISTS coupons_code_idx ON public.coupons (code);

-- 3) Ensure coupon_redemptions exists and converge schema
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
  redeemed_by_user_id uuid NOT NULL,
  issued_to_user_id uuid NULL,
  issued_to_email text NULL,
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  amount_before integer NOT NULL,
  discount_amount integer NOT NULL,
  amount_after integer NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.coupon_redemptions
  ADD COLUMN IF NOT EXISTS redeemed_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS issued_to_user_id uuid,
  ADD COLUMN IF NOT EXISTS issued_to_email text,
  ADD COLUMN IF NOT EXISTS tournament_id uuid,
  ADD COLUMN IF NOT EXISTS amount_before integer,
  ADD COLUMN IF NOT EXISTS discount_amount integer,
  ADD COLUMN IF NOT EXISTS amount_after integer,
  ADD COLUMN IF NOT EXISTS redeemed_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coupon_redemptions' AND column_name = 'user_id'
  ) THEN
    EXECUTE $$UPDATE public.coupon_redemptions SET redeemed_by_user_id = COALESCE(redeemed_by_user_id, user_id)$$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coupon_redemptions' AND column_name = 'metadata'
  ) THEN
    EXECUTE $$UPDATE public.coupon_redemptions SET meta = COALESCE(meta, metadata, '{}'::jsonb)$$;
    EXECUTE $$ALTER TABLE public.coupon_redemptions DROP COLUMN IF EXISTS metadata$$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coupon_redemptions' AND column_name = 'subscription_id'
  ) THEN
    EXECUTE $$ALTER TABLE public.coupon_redemptions DROP COLUMN IF EXISTS subscription_id$$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coupon_redemptions' AND column_name = 'user_id'
  ) THEN
    EXECUTE $$ALTER TABLE public.coupon_redemptions DROP COLUMN IF EXISTS user_id$$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'coupon_redemptions'
      AND column_name = 'discount_amount'
      AND data_type <> 'integer'
  ) THEN
    ALTER TABLE public.coupon_redemptions
      ALTER COLUMN discount_amount TYPE integer
      USING round(discount_amount::numeric)::integer;
  END IF;
END
$$;

UPDATE public.coupon_redemptions
SET meta = '{}'::jsonb
WHERE meta IS NULL;

ALTER TABLE public.coupon_redemptions
  ALTER COLUMN redeemed_by_user_id SET NOT NULL,
  ALTER COLUMN tournament_id SET NOT NULL,
  ALTER COLUMN amount_before SET NOT NULL,
  ALTER COLUMN discount_amount SET NOT NULL,
  ALTER COLUMN amount_after SET NOT NULL,
  ALTER COLUMN redeemed_at SET NOT NULL,
  ALTER COLUMN meta SET NOT NULL;

ALTER TABLE public.coupon_redemptions
  ALTER COLUMN redeemed_at SET DEFAULT now(),
  ALTER COLUMN meta SET DEFAULT '{}'::jsonb;

ALTER TABLE public.coupon_redemptions
  DROP CONSTRAINT IF EXISTS coupon_redemptions_coupon_id_fkey,
  ADD CONSTRAINT coupon_redemptions_coupon_id_fkey FOREIGN KEY (coupon_id)
    REFERENCES public.coupons(id) ON DELETE RESTRICT,
  DROP CONSTRAINT IF EXISTS coupon_redemptions_tournament_id_fkey,
  ADD CONSTRAINT coupon_redemptions_tournament_id_fkey FOREIGN KEY (tournament_id)
    REFERENCES public.tournaments(id) ON DELETE CASCADE,
  DROP CONSTRAINT IF EXISTS coupon_redemptions_amounts_valid,
  ADD CONSTRAINT coupon_redemptions_amounts_valid CHECK (
    amount_before >= 0
    AND discount_amount >= 0
    AND amount_after >= 0
    AND amount_after = amount_before - discount_amount
  );

CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_id_idx ON public.coupon_redemptions (coupon_id);
CREATE INDEX IF NOT EXISTS coupon_redemptions_redeemed_by_user_id_idx ON public.coupon_redemptions (redeemed_by_user_id);
CREATE INDEX IF NOT EXISTS coupon_redemptions_tournament_id_idx ON public.coupon_redemptions (tournament_id);
CREATE INDEX IF NOT EXISTS coupon_redemptions_redeemed_at_idx ON public.coupon_redemptions (redeemed_at DESC);

-- 4) Tournament-level pro entitlements
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

-- 5) RLS hardening for coupons and redemptions
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'coupons'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.coupons', p.policyname);
  END LOOP;

  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'coupon_redemptions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.coupon_redemptions', p.policyname);
  END LOOP;
END
$$;

CREATE POLICY coupons_select_master_only
ON public.coupons
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'master'::public.app_role));

CREATE POLICY coupons_insert_master_only
ON public.coupons
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'master'::public.app_role));

CREATE POLICY coupons_update_master_only
ON public.coupons
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'master'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'master'::public.app_role));

CREATE POLICY coupons_delete_master_only
ON public.coupons
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'master'::public.app_role));

CREATE POLICY coupon_redemptions_select_own_or_master
ON public.coupon_redemptions
FOR SELECT
TO authenticated
USING (
  redeemed_by_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'master'::public.app_role)
);

CREATE POLICY coupon_redemptions_insert_master_only
ON public.coupon_redemptions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'master'::public.app_role));

CREATE POLICY coupon_redemptions_update_master_only
ON public.coupon_redemptions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'master'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'master'::public.app_role));

CREATE POLICY coupon_redemptions_delete_master_only
ON public.coupon_redemptions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'master'::public.app_role));

-- 6) Canonical RPC functions for tournament coupon validation and redemption
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
      v_now + interval '1 month'
    );
  END IF;

  RETURN QUERY SELECT v_after, v_discount, 'redeemed'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_coupon_for_tournament(text, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_coupon_for_tournament(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_coupon_for_tournament(text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon_for_tournament(text, uuid, integer) TO authenticated;
