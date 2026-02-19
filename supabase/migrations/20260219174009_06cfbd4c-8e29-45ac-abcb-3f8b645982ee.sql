
-- Fix remaining mutable search path: coupon_redemptions_sync_user_id and normalize_coupon_code
ALTER FUNCTION public.coupon_redemptions_sync_user_id() SET search_path TO 'public';
ALTER FUNCTION public.normalize_coupon_code() SET search_path TO 'public';
