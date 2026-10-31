-- Synthetic-only helpers for the Team V2 bulk player-import concurrency test.
-- Loaded AFTER seed.sql in the isolated CI database. Never applied to production.
--
-- Production parity mirrored here (read SELECT-only from production 2026-10-31):
--   * public.import_replace_players: ONE plpgsql call, one DELETE of every
--     tournament player, then ONE INSERT ... SELECT FROM jsonb_array_elements.
--     SECURITY DEFINER; invoked by PostgREST as `authenticated` under
--     statement_timeout=8s (role authenticated) and lock_timeout=8s (role
--     authenticator).
--   * BEFORE UPDATE trigger update_tournaments_updated_at on public.tournaments
--     (update_updated_at_column). The candidate epoch trigger UPDATEs the
--     tournament row once per affected player row, so this trigger is on the
--     measured path in production and must be on it here too.
-- Not mirrored (documented limitation): players BEFORE-row triggers
-- set_updated_at / trg_players_normalize_dob, and the wider production players
-- column set. Neither touches tournaments or takes extra locks.

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;
DROP TRIGGER IF EXISTS update_tournaments_updated_at ON public.tournaments;
CREATE TRIGGER update_tournaments_updated_at
BEFORE UPDATE ON public.tournaments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Deterministic synthetic roster: the four seed players (exact seed values,
-- optionally with Club A points overridden) followed by (n - 4) synthetic
-- players in other clubs with points 0..3, so Club A (5+4) stays the winner.
-- p_poison appends one malformed row that makes the INSERT cast fail.
-- The poison row is only appended to the canary roster.
CREATE OR REPLACE FUNCTION qa.synthetic_roster(
  p_n integer, p_club_a_top numeric DEFAULT 5, p_club_a_second numeric DEFAULT 4,
  p_poison boolean DEFAULT false, p_other_event boolean DEFAULT false
) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $fn$
  -- p_other_event: same shape with ids in a disjoint range, for a second event.
  SELECT CASE WHEN p_other_event THEN (
    SELECT jsonb_agg(jsonb_build_object(
      'id', ('00000000-0000-4000-a000-' || lpad(g::text, 12, '0')),
      'points', (g % 6)::text, 'club', 'Other Club ' || (g % 50)) ORDER BY g)
    FROM generate_series(1, p_n) g)
  ELSE jsonb_build_array(
      jsonb_build_object('id','00000000-0000-4000-8000-000000000004','points',p_club_a_top::text,'club','Club A'),
      jsonb_build_object('id','00000000-0000-4000-8000-000000000005','points',p_club_a_second::text,'club','Club A'),
      jsonb_build_object('id','00000000-0000-4000-8000-000000000024','points','5','club','Club B'),
      jsonb_build_object('id','00000000-0000-4000-8000-000000000025','points','4','club','Club B'))
    || COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0')),
        'points', (g % 4)::text,
        'club', 'Synthetic Club ' || (g % 50)) ORDER BY g)
      FROM generate_series(1, GREATEST(p_n - 4, 0)) g), '[]'::jsonb)
    || CASE WHEN p_poison THEN jsonb_build_array(jsonb_build_object(
         'id','00000000-0000-4000-9999-000000000000','points','not-a-number','club','Bad'))
       ELSE '[]'::jsonb END
  END;
$fn$;

-- Same transaction shape as production import_replace_players: delete every
-- player of the tournament, then insert the whole payload in one statement.
-- Synthetic ids are passed through so "identical data" is truly identical.
CREATE OR REPLACE FUNCTION qa.import_replace_players(p_tournament_id uuid, p_players jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_inserted integer;
BEGIN
  DELETE FROM public.players pl WHERE pl.tournament_id = p_tournament_id;
  INSERT INTO public.players (id, tournament_id, points, club)
  SELECT (p ->> 'id')::uuid, p_tournament_id, (p ->> 'points')::numeric,
         nullif(p ->> 'club', '')
  FROM jsonb_array_elements(p_players) AS p;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION qa.import_replace_players(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qa.import_replace_players(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION qa.synthetic_roster(integer, numeric, numeric, boolean, boolean) TO authenticated;

-- Content checksums (not row counts) for the invariants under test.
CREATE OR REPLACE FUNCTION qa.players_checksum(p_tournament_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $fn$
  SELECT md5(COALESCE(string_agg(p.id::text || ':' || COALESCE(p.points::text,'') || ':' ||
                                 COALESCE(p.club,''), ',' ORDER BY p.id), ''))
  FROM public.players p WHERE p.tournament_id = p_tournament_id;
$fn$;
CREATE OR REPLACE FUNCTION qa.saved_history_checksum(p_tournament_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $fn$
  SELECT md5(
    COALESCE((SELECT string_agg(a.version || ':' || a.prize_id || ':' || a.player_id, ','
                ORDER BY a.version, a.prize_id, a.player_id)
              FROM public.allocations a WHERE a.tournament_id = p_tournament_id), '') || '|' ||
    COALESCE((SELECT string_agg(t.version || ':' || t.prize_id || ':' || t.institution_key || ':' ||
                t.total_points, ',' ORDER BY t.version, t.prize_id)
              FROM public.team_allocations t WHERE t.tournament_id = p_tournament_id), '') || '|' ||
    COALESCE((SELECT string_agg(pb.allocation_version || ':' || pb.is_active, ','
                ORDER BY pb.allocation_version)
              FROM public.publications pb WHERE pb.tournament_id = p_tournament_id), ''));
$fn$;

-- Timed import as the PostgREST role, returning measured evidence.
-- tournament_row_updates comes from this transaction's own statistics.
CREATE OR REPLACE FUNCTION qa.measure_import(p_tournament_id uuid, p_players jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $fn$
DECLARE
  t0 timestamptz := pg_catalog.clock_timestamp();
  upd0 bigint; upd1 bigint; n integer;
BEGIN
  SELECT COALESCE(n_tup_upd, 0) INTO upd0 FROM pg_catalog.pg_stat_xact_user_tables
   WHERE relid = 'public.tournaments'::regclass;
  n := qa.import_replace_players(p_tournament_id, p_players);
  SELECT COALESCE(n_tup_upd, 0) INTO upd1 FROM pg_catalog.pg_stat_xact_user_tables
   WHERE relid = 'public.tournaments'::regclass;
  RETURN jsonb_build_object(
    'inserted', n,
    'ms', round(extract(epoch FROM pg_catalog.clock_timestamp() - t0) * 1000, 1),
    'tournament_row_updates', COALESCE(upd1, 0) - COALESCE(upd0, 0));
END;
$fn$;
GRANT EXECUTE ON FUNCTION qa.measure_import(uuid, jsonb) TO authenticated;
