
-- Add issued_to fields to coupons
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS issued_to_email text,
  ADD COLUMN IF NOT EXISTS issued_to_user_id uuid;

-- Index for lookup by issued user
CREATE INDEX IF NOT EXISTS idx_coupons_issued_to_user
  ON public.coupons (issued_to_user_id)
  WHERE issued_to_user_id IS NOT NULL;

-- Add tournament_id to coupon_redemptions for per-tournament tracking
ALTER TABLE public.coupon_redemptions
  ADD COLUMN IF NOT EXISTS tournament_id uuid REFERENCES public.tournaments(id);
