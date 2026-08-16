-- PF1-A — one billing basis, one tier ladder.
-- Before: get_tournament_pro_price and get_tournament_access_state each counted
-- players and applied the 0/500/1000 ladder inline (S5: "change one, change both").
-- After: both call the shared helpers below. Behaviour is unchanged, and proven
-- unchanged over every live tournament before this migration commits.

BEGIN;

-- ── shared helper 1: the billing basis (E2 high-water mark) ────────────────
CREATE OR REPLACE FUNCTION public.tournament_billing_basis(p_tournament_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT GREATEST(
    (SELECT count(*)::integer FROM public.players p
      WHERE p.tournament_id = p_tournament_id),
    (SELECT COALESCE(max(w.players_count_max), 0)::integer
       FROM public.tournament_player_watermark w
      WHERE w.tournament_id = p_tournament_id)
  )
$fn$;

-- ── shared helper 2: the tier ladder, and the ONLY place 150 is written ────
CREATE OR REPLACE FUNCTION public.tournament_pro_tier(p_billing_basis integer)
RETURNS TABLE(amount_inr integer, tier_label text,
              is_free_small_tournament boolean, free_player_threshold integer)
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT
    CASE WHEN COALESCE(p_billing_basis,0) <= 150 THEN 0
         WHEN COALESCE(p_billing_basis,0) <= 500 THEN 500
         ELSE 1000 END,
    CASE WHEN COALESCE(p_billing_basis,0) <= 150 THEN 'free_0_to_150'
         WHEN COALESCE(p_billing_basis,0) <= 500 THEN 'pro_151_to_500'
         ELSE 'pro_501_plus' END,
    COALESCE(p_billing_basis,0) <= 150,
    150
$fn$;

-- D18 / N1: both grant paths must be closed on every new function.
REVOKE ALL ON FUNCTION public.tournament_billing_basis(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tournament_billing_basis(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.tournament_billing_basis(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.tournament_pro_tier(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tournament_pro_tier(integer) FROM anon;
REVOKE ALL ON FUNCTION public.tournament_pro_tier(integer) FROM authenticated;

-- ── equivalence proof, BEFORE anything is rewired ─────────────────────────
DO $verify$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM (
    SELECT t.id,
           (SELECT count(*)::integer FROM public.players p
             WHERE p.tournament_id = t.id) AS live,
           COALESCE(w.players_count_max, 0)::integer AS wm
      FROM public.tournaments t
      LEFT JOIN public.tournament_player_watermark w ON w.tournament_id = t.id
  ) b
  WHERE public.tournament_billing_basis(b.id)
          IS DISTINCT FROM GREATEST(b.live, b.wm)
     OR (SELECT tt.amount_inr
           FROM public.tournament_pro_tier(GREATEST(b.live, b.wm)) tt)
          IS DISTINCT FROM (CASE WHEN GREATEST(b.live, b.wm) <= 150 THEN 0
                                 WHEN GREATEST(b.live, b.wm) <= 500 THEN 500
                                 ELSE 1000 END)
     OR (SELECT tt.tier_label
           FROM public.tournament_pro_tier(GREATEST(b.live, b.wm)) tt)
          IS DISTINCT FROM (CASE WHEN GREATEST(b.live, b.wm) <= 150 THEN 'free_0_to_150'
                                 WHEN GREATEST(b.live, b.wm) <= 500 THEN 'pro_151_to_500'
                                 ELSE 'pro_501_plus' END);

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'PF1A_VERIFY_FAILED: % tournaments disagree with the shared helpers', v_bad;
  END IF;
END
$verify$;

-- ── rewire 1: price ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_tournament_pro_price(tournament_id uuid)
RETURNS TABLE(players_count integer, is_free_small_tournament boolean,
              amount_inr integer, tier_label text, free_player_threshold integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_billing integer := 0;
  v_amount integer;
  v_label text;
  v_is_free boolean;
  v_threshold integer;
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

  IF NOT (v_owner_id = v_user_id
          OR public.has_role(v_user_id, 'master'::public.app_role)) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  v_billing := public.tournament_billing_basis(get_tournament_pro_price.tournament_id);

  SELECT tt.amount_inr, tt.tier_label, tt.is_free_small_tournament, tt.free_player_threshold
    INTO v_amount, v_label, v_is_free, v_threshold
    FROM public.tournament_pro_tier(v_billing) tt;

  players_count := v_billing;
  free_player_threshold := v_threshold;
  is_free_small_tournament := v_is_free;
  amount_inr := v_amount;
  tier_label := v_label;

  RETURN NEXT;
END;
$fn$;

-- ── rewire 2: access state ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_tournament_access_state(tournament_id uuid)
RETURNS TABLE(has_full_access boolean, is_free_small_tournament boolean,
              players_count integer, preview_main_limit integer,
              free_player_threshold integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_billing integer := 0;
  v_is_free boolean;
  v_threshold integer;
  v_has_active_entitlement boolean := false;
  v_is_master boolean := false;
BEGIN
  v_billing := public.tournament_billing_basis(get_tournament_access_state.tournament_id);

  SELECT tt.is_free_small_tournament, tt.free_player_threshold
    INTO v_is_free, v_threshold
    FROM public.tournament_pro_tier(v_billing) tt;

  SELECT EXISTS (
    SELECT 1 FROM public.tournament_entitlements te
    WHERE te.tournament_id = get_tournament_access_state.tournament_id
      AND now() >= te.starts_at
      AND now() <  te.ends_at
  ) INTO v_has_active_entitlement;

  IF auth.uid() IS NOT NULL
     AND public.has_role(auth.uid(), 'master'::public.app_role) THEN
    v_is_master := true;
  END IF;

  is_free_small_tournament := v_is_free;
  has_full_access := is_free_small_tournament OR v_has_active_entitlement;

  IF v_is_master THEN
    has_full_access := true;
    is_free_small_tournament := false;
    preview_main_limit := NULL;
  ELSE
    preview_main_limit := CASE WHEN has_full_access THEN NULL ELSE 8 END;
  END IF;

  players_count := v_billing;
  free_player_threshold := v_threshold;
  RETURN NEXT;
END;
$fn$;

-- ── structural proof: no inline copy of the rule survives ─────────────────
DO $struct$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('get_tournament_pro_price','get_tournament_access_state')
         AND p.prosrc LIKE '%tournament_billing_basis%') <> 2 THEN
    RAISE EXCEPTION 'PF1A_STRUCT_FAILED: price/access not rewired to the shared basis';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('get_tournament_pro_price','get_tournament_access_state')
         AND (p.prosrc LIKE '%players_count_max%' OR p.prosrc LIKE '%150%')) <> 0 THEN
    RAISE EXCEPTION 'PF1A_STRUCT_FAILED: an inline watermark or threshold copy survives';
  END IF;
END
$struct$;

-- Dead grant, removed rather than left to drift (S2/S6). anon held an explicit
-- EXECUTE on get_tournament_pro_price while get_tournament_access_state did not
-- — the same asymmetry shape as publish/unpublish (E3). It is provably unusable:
-- the function's first statement raises UNAUTHORIZED when auth.uid() is NULL,
-- which it always is for anon. Sole caller is TournamentUpgrade.tsx, authenticated.
REVOKE ALL ON FUNCTION public.get_tournament_pro_price(uuid) FROM anon;

-- ── grant proof ───────────────────────────────────────────────────────────
DO $grants$
DECLARE
  v_msg text := '';
BEGIN
  IF has_function_privilege('anon','public.tournament_billing_basis(uuid)','EXECUTE')
    THEN v_msg := v_msg || 'anon can execute billing_basis; '; END IF;
  IF has_function_privilege('authenticated','public.tournament_billing_basis(uuid)','EXECUTE')
    THEN v_msg := v_msg || 'authenticated can execute billing_basis; '; END IF;
  IF has_function_privilege('anon','public.tournament_pro_tier(integer)','EXECUTE')
    THEN v_msg := v_msg || 'anon can execute pro_tier; '; END IF;
  IF has_function_privilege('authenticated','public.tournament_pro_tier(integer)','EXECUTE')
    THEN v_msg := v_msg || 'authenticated can execute pro_tier; '; END IF;
  IF NOT has_function_privilege('authenticated','public.get_tournament_pro_price(uuid)','EXECUTE')
    THEN v_msg := v_msg || 'authenticated LOST price EXECUTE; '; END IF;
  IF NOT has_function_privilege('authenticated','public.get_tournament_access_state(uuid)','EXECUTE')
    THEN v_msg := v_msg || 'authenticated LOST access_state EXECUTE; '; END IF;
  IF has_function_privilege('anon','public.get_tournament_pro_price(uuid)','EXECUTE')
    THEN v_msg := v_msg || 'anon gained price EXECUTE; '; END IF;
  IF has_function_privilege('anon','public.get_tournament_access_state(uuid)','EXECUTE')
    THEN v_msg := v_msg || 'anon gained access_state EXECUTE; '; END IF;

  IF v_msg <> '' THEN
    RAISE EXCEPTION 'PF1A_GRANTS_FAILED: %', v_msg;
  END IF;
END
$grants$;

COMMIT;
