-- DRAFT only: mutation-lineage fingerprint support for Team Ranking v2.
-- Dependency: 20261027080000_team_v2_adjudicated_atomic_version.sql.
-- Keep SECURITY DEFINER trigger rights isolated from the INVOKER-only
-- monetary allocation RPC. Must be full-schema and load tested before deploy.
-- No existing tournament rows or published allocations are backfilled.
-- Consistent-source guard across separate HTTP scorers. Every *committed*
-- mutation of a scorer input row touches the parent tournament MVCC version.
-- Its xmin is already part of team_v2_source_fingerprint; unlike hashing
-- surviving rows alone, INSERT followed by DELETE cannot erase this evidence.
-- This does not persist personal data, add a backfill or delete saved awards.
-- This table-touch strategy is a draft candidate: measure large import cost
-- and test the actual production schema before any deployment.
CREATE FUNCTION public.team_v2_record_source_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $source_epoch$
DECLARE
  old_tournament uuid;
  new_tournament uuid;
  touched uuid;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' THEN
    RAISE EXCEPTION 'team_v2_unknown_source_schema';
  END IF;
  IF TG_TABLE_NAME IN ('categories','players','rule_config','institution_prize_groups') THEN
    IF TG_OP <> 'INSERT' THEN old_tournament := OLD.tournament_id; END IF;
    IF TG_OP <> 'DELETE' THEN new_tournament := NEW.tournament_id; END IF;
  ELSIF TG_TABLE_NAME = 'prizes' THEN
    IF TG_OP <> 'INSERT' THEN
      SELECT c.tournament_id INTO old_tournament FROM public.categories c
      WHERE c.id = OLD.category_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT c.tournament_id INTO new_tournament FROM public.categories c
      WHERE c.id = NEW.category_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'institution_prizes' THEN
    IF TG_OP <> 'INSERT' THEN
      SELECT g.tournament_id INTO old_tournament FROM public.institution_prize_groups g
      WHERE g.id = OLD.group_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT g.tournament_id INTO new_tournament FROM public.institution_prize_groups g
      WHERE g.id = NEW.group_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'team_v2_unknown_source_table';
  END IF;
  -- Always acquire tournament row locks in the same order when records move
  -- between tournaments. No table-wide new epoch table or retention of IDs.
  FOR touched IN
    SELECT DISTINCT v.tournament_id
    FROM (VALUES (old_tournament), (new_tournament)) AS v(tournament_id)
    WHERE v.tournament_id IS NOT NULL
    ORDER BY v.tournament_id
  LOOP
    -- A row trigger exists at schema level, but must have no writes or locks
    -- on any event other than a deliberately opted-in test tournament.
    IF NOT public.team_v2_canary_active(touched) THEN CONTINUE; END IF;
    UPDATE public.tournaments
       SET updated_at = pg_catalog.clock_timestamp()
     WHERE id = touched;
  END LOOP;
  -- All triggers below are AFTER ROW; the trigger return value is ignored.
  RETURN NULL;
END;
$source_epoch$;
REVOKE EXECUTE ON FUNCTION public.team_v2_record_source_change()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER team_v2_epoch_categories
AFTER INSERT OR UPDATE OR DELETE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.team_v2_record_source_change();

CREATE TRIGGER team_v2_epoch_prizes
AFTER INSERT OR UPDATE OR DELETE ON public.prizes
FOR EACH ROW EXECUTE FUNCTION public.team_v2_record_source_change();

CREATE TRIGGER team_v2_epoch_players
AFTER INSERT OR UPDATE OR DELETE ON public.players
FOR EACH ROW EXECUTE FUNCTION public.team_v2_record_source_change();

CREATE TRIGGER team_v2_epoch_rule_config
AFTER INSERT OR UPDATE OR DELETE ON public.rule_config
FOR EACH ROW EXECUTE FUNCTION public.team_v2_record_source_change();

CREATE TRIGGER team_v2_epoch_institution_groups
AFTER INSERT OR UPDATE OR DELETE ON public.institution_prize_groups
FOR EACH ROW EXECUTE FUNCTION public.team_v2_record_source_change();

CREATE TRIGGER team_v2_epoch_institution_prizes
AFTER INSERT OR UPDATE OR DELETE ON public.institution_prizes
FOR EACH ROW EXECUTE FUNCTION public.team_v2_record_source_change();
