-- Stage 3: remove anon EXECUTE from signed-in/admin-only SECURITY DEFINER functions.
-- Rollback: GRANT EXECUTE ON FUNCTION <fn> TO anon; (and TO authenticated for expire_stuck_extraction_documents)
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.admin_create_coupon(text,text,numeric,timestamptz,timestamptz,integer,integer,boolean,text,uuid,text)',
    'public.admin_list_coupons()',
    'public.detect_missing_team_snapshots()',
    'public.import_replace_players(uuid,jsonb)',
    'public.list_my_tournaments(boolean)',
    'public.redeem_coupon_for_tournament(text,uuid,integer)',
    'public.apply_coupon_for_tournament(text,uuid,integer)',
    'public.get_or_create_my_referral_code()',
    'public.bootstrap_master()'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- Cron-only routine: no browser caller.
REVOKE EXECUTE ON FUNCTION public.expire_stuck_extraction_documents() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stuck_extraction_documents() TO service_role;