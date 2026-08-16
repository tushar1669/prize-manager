-- Client write-grant audit, Step 3 (D38/D39).
--
-- get_tournament_pro_price and get_tournament_access_state both computed the
-- tier from a LIVE count(*) on public.players. players is client-writable by
-- the tournament owner under org_players_access. The payer therefore controlled
-- the input to their own price -- the same self-attestation shape as
-- profiles.profile_reward_claimed in D36.
--
-- Proven 14 Aug 2026 as 753b536b in rolled-back blocks:
--   1119 players = Rs1000 -> deleted 620 -> 499 players = Rs500
--    294 players full_access=f -> deleted 150 -> 144 players full_access=t
-- The entitlement lasts 365 days and nothing re-checks tier, so deleting,
-- paying the lower tier, and re-importing is durable.
--
-- Decision (Option A): bill on the HIGH-WATER MARK -- the greatest player count
-- the tournament has ever had. Deleting players can no longer lower the price.
--
-- The watermark is NOT a column on public.tournaments. authenticated holds
-- table-wide UPDATE on tournaments under org_update_own_tournaments with no
-- column-level restriction, so an owner could simply set it to zero. That is the
-- D36 trap exactly: RLS restricts rows, never columns. It lives in its own table
-- with RLS on, zero policies, and zero client grants -- unreachable by
-- construction, not by policy.
--
-- Backfill sets every watermark to today's live count, so NO price changes on
-- the day this ships and no existing entitlement is affected.

-- ── 1) The watermark store ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournament_player_watermark (
  tournament_id     uuid PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE CASCADE,
  players_count_max integer NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tournament_player_watermark ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies. RLS with zero policies denies by default.

-- Supabase default privileges grant new public tables to anon/authenticated.
-- That is how 26 tables ended up in this audit. Close it at creation time.
REVOKE ALL ON TABLE public.tournament_player_watermark FROM PUBLIC;
REVOKE ALL ON TABLE public.tournament_player_watermark FROM anon;
REVOKE ALL ON TABLE public.tournament_player_watermark FROM authenticated;

-- ── 2) Backfill to today's live counts (no price moves) ─────────────────────
INSERT INTO public.tournament_player_watermark (tournament_id, players_count_max)
SELECT t.id, (SELECT count(*) FROM public.players p WHERE p.tournament_id = t.id)
FROM public.tournaments t
ON CONFLICT (tournament_id) DO NOTHING;

-- ── 3) Raise-only maintenance ────────────────────────────────────────────────
-- Statement-level with a transition table: one recompute per statement, not per
-- row, so a 1200-player import stays cheap. DELETE is deliberately NOT handled:
-- the watermark must never fall. That omission is the fix.
--
-- Postgres forbids REFERENCING on a trigger with more than one event
-- (SQLSTATE 0A000), so INSERT and UPDATE get one trigger each, sharing one
-- function. The transition table is named new_players in both.
CREATE OR REPLACE FUNCTION public.tg_players_bump_watermark()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.tournament_player_watermark AS w (tournament_id, players_count_max, updated_at)
  SELECT s.tid,
         (SELECT count(*) FROM public.players p WHERE p.tournament_id = s.tid),
         now()
  FROM (SELECT DISTINCT tournament_id AS tid FROM new_players WHERE tournament_id IS NOT NULL) s
  ON CONFLICT (tournament_id) DO UPDATE
    SET players_count_max = GREATEST(w.players_count_max, EXCLUDED.players_count_max),
        updated_at = now();
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_players_bump_watermark ON public.players;
DROP TRIGGER IF EXISTS trg_players_bump_watermark_ins ON public.players;
DROP TRIGGER IF EXISTS trg_players_bump_watermark_upd ON public.players;

CREATE TRIGGER trg_players_bump_watermark_ins
AFTER INSERT ON public.players
REFERENCING NEW TABLE AS new_players
FOR EACH STATEMENT EXECUTE FUNCTION public.tg_players_bump_watermark();

CREATE TRIGGER trg_players_bump_watermark_upd
AFTER UPDATE ON public.players
REFERENCING NEW TABLE AS new_players
FOR EACH STATEMENT EXECUTE FUNCTION public.tg_players_bump_watermark();

-- Trigger-function privileges are checked at CREATE TRIGGER time, so revoke after.
REVOKE EXECUTE ON FUNCTION public.tg_players_bump_watermark() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_players_bump_watermark() FROM anon;
REVOKE EXECUTE ON FUNCTION public.tg_players_bump_watermark() FROM authenticated;

-- ── 4) Price on the billing basis ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_tournament_pro_price(tournament_id uuid)
 RETURNS TABLE(players_count integer, is_free_small_tournament boolean, amount_inr integer, tier_label text, free_player_threshold integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_live_count integer := 0;
  v_watermark integer := 0;
  v_billing integer := 0;
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

  SELECT COUNT(*)::integer INTO v_live_count
  FROM public.players p
  WHERE p.tournament_id = get_tournament_pro_price.tournament_id;

  SELECT COALESCE(w.players_count_max, 0) INTO v_watermark
  FROM public.tournament_player_watermark w
  WHERE w.tournament_id = get_tournament_pro_price.tournament_id;

  v_billing := GREATEST(v_live_count, COALESCE(v_watermark, 0));

  players_count := v_billing;
  free_player_threshold := v_free_player_threshold;

  IF v_billing <= v_free_player_threshold THEN
    is_free_small_tournament := true;
    amount_inr := 0;
    tier_label := 'free_0_to_150';
  ELSIF v_billing <= 500 THEN
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
$function$;

-- ── 5) Access gate on the same basis ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_tournament_access_state(tournament_id uuid)
 RETURNS TABLE(has_full_access boolean, is_free_small_tournament boolean, players_count integer, preview_main_limit integer, free_player_threshold integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_live_count integer := 0;
  v_watermark integer := 0;
  v_billing integer := 0;
  v_has_active_entitlement boolean := false;
  v_is_master boolean := false;
  v_free_player_threshold CONSTANT integer := 150;
BEGIN
  SELECT COUNT(*)::integer INTO v_live_count
  FROM public.players p
  WHERE p.tournament_id = get_tournament_access_state.tournament_id;

  SELECT COALESCE(w.players_count_max, 0) INTO v_watermark
  FROM public.tournament_player_watermark w
  WHERE w.tournament_id = get_tournament_access_state.tournament_id;

  v_billing := GREATEST(v_live_count, COALESCE(v_watermark, 0));

  SELECT EXISTS (
    SELECT 1 FROM public.tournament_entitlements te
    WHERE te.tournament_id = get_tournament_access_state.tournament_id
      AND now() >= te.starts_at
      AND now() < te.ends_at
  ) INTO v_has_active_entitlement;

  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'master'::public.app_role) THEN
    v_is_master := true;
  END IF;

  is_free_small_tournament := (v_billing <= v_free_player_threshold);
  has_full_access := is_free_small_tournament OR v_has_active_entitlement;

  IF v_is_master THEN
    has_full_access := true;
    is_free_small_tournament := false;
    preview_main_limit := NULL;
  ELSE
    preview_main_limit := CASE WHEN has_full_access THEN NULL ELSE 8 END;
  END IF;

  players_count := v_billing;
  free_player_threshold := v_free_player_threshold;
  RETURN NEXT;
END;
$function$;

-- ── 6) Master override for bad imports ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.master_reset_player_watermark(p_tournament_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_n integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public.has_role(v_uid, 'master'::public.app_role) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT COUNT(*)::integer INTO v_n
  FROM public.players p WHERE p.tournament_id = p_tournament_id;

  INSERT INTO public.tournament_player_watermark AS w (tournament_id, players_count_max, updated_at)
  VALUES (p_tournament_id, v_n, now())
  ON CONFLICT (tournament_id) DO UPDATE
    SET players_count_max = EXCLUDED.players_count_max, updated_at = now();

  RETURN v_n;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.master_reset_player_watermark(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.master_reset_player_watermark(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.master_reset_player_watermark(uuid) TO authenticated;

-- ── 7) Self-verify: fail rather than half-apply ──────────────────────────────
DO $$
DECLARE
  v_pol int; v_rows int; v_t int; v_bad int; v_trg int;
BEGIN
  SELECT count(*) INTO v_pol FROM pg_policies
   WHERE schemaname='public' AND tablename='tournament_player_watermark';
  IF v_pol <> 0 THEN
    RAISE EXCEPTION 'watermark table has % policies, expected 0', v_pol;
  END IF;

  IF has_table_privilege('anon','public.tournament_player_watermark','SELECT')
     OR has_table_privilege('authenticated','public.tournament_player_watermark','SELECT')
     OR has_table_privilege('authenticated','public.tournament_player_watermark','UPDATE')
     OR has_table_privilege('authenticated','public.tournament_player_watermark','INSERT') THEN
    RAISE EXCEPTION 'watermark table still reachable by a client role';
  END IF;

  SELECT count(*) INTO v_trg FROM pg_trigger
   WHERE tgrelid='public.players'::regclass
     AND tgname IN ('trg_players_bump_watermark_ins','trg_players_bump_watermark_upd');
  IF v_trg <> 2 THEN
    RAISE EXCEPTION 'expected 2 watermark triggers on players, found %', v_trg;
  END IF;

  SELECT count(*) INTO v_rows FROM public.tournament_player_watermark;
  SELECT count(*) INTO v_t FROM public.tournaments;
  IF v_rows <> v_t THEN
    RAISE EXCEPTION 'backfill incomplete: % watermark rows for % tournaments', v_rows, v_t;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.tournaments t
  JOIN public.tournament_player_watermark w ON w.tournament_id = t.id
  WHERE w.players_count_max <> (SELECT count(*) FROM public.players p WHERE p.tournament_id = t.id);
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'PRICE WOULD MOVE TODAY for % tournaments -- backfill wrong', v_bad;
  END IF;

  RAISE NOTICE 'OK: watermark sealed, % rows backfilled, zero price movement', v_rows;
END $$;
