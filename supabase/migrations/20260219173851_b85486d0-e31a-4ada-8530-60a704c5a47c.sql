
-- Fix search_path warnings on functions from previous migration
ALTER FUNCTION public.review_tournament_payment(uuid, text, text) SET search_path TO 'public';
ALTER FUNCTION public.issue_referral_rewards(uuid, uuid) SET search_path TO 'public';
