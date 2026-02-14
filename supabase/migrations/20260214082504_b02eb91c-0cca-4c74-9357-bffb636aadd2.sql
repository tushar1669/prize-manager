
-- Coupons table
CREATE TABLE public.coupons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL,
  discount_type text NOT NULL DEFAULT 'percentage', -- 'percentage' or 'fixed'
  discount_value numeric NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer,
  max_redemptions_per_user integer DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupons_code_unique UNIQUE (code),
  CONSTRAINT coupons_discount_type_check CHECK (discount_type IN ('percentage', 'fixed')),
  CONSTRAINT coupons_discount_value_positive CHECK (discount_value >= 0)
);

-- Coupon redemptions table
CREATE TABLE public.coupon_redemptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  discount_amount numeric NOT NULL DEFAULT 0,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

-- Coupons RLS: master full access, public can read active coupons
CREATE POLICY "master_full_access_coupons"
  ON public.coupons FOR ALL
  USING (public.is_master())
  WITH CHECK (public.is_master());

CREATE POLICY "authenticated_read_active_coupons"
  ON public.coupons FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Coupon redemptions RLS: master full access, users read own
CREATE POLICY "master_full_access_coupon_redemptions"
  ON public.coupon_redemptions FOR ALL
  USING (public.is_master())
  WITH CHECK (public.is_master());

CREATE POLICY "users_read_own_redemptions"
  ON public.coupon_redemptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users_insert_own_redemptions"
  ON public.coupon_redemptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Updated_at trigger for coupons
CREATE TRIGGER update_coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Index for fast lookups
CREATE INDEX idx_coupons_code ON public.coupons (code);
CREATE INDEX idx_coupon_redemptions_coupon_id ON public.coupon_redemptions (coupon_id);
CREATE INDEX idx_coupon_redemptions_user_id ON public.coupon_redemptions (user_id);
