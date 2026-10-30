-- Team Ranking v2 opt-in: deny-by-default, per-tournament DB boundary.
-- This schema is installed without enabling a single tournament. Do not
-- seed real tournament IDs in migrations. A separate controlled operator
-- action may enable only a synthetic admin-owned test tournament after checks.
-- Retain historical and noncanary production allocation behavior until the
-- owner separately authorizes general-availability migration.
CREATE TABLE public.team_v2_canary_tournaments (
  tournament_id uuid PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.team_v2_canary_tournaments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_v2_canary_tournaments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_v2_canary_tournaments TO service_role;
CREATE POLICY team_v2_canary_service_only
 ON public.team_v2_canary_tournaments
 FOR ALL TO service_role USING (true) WITH CHECK (true);

-- No access to the canary roster through unauthenticated RPC or browser Data API.
-- The service-role Save checks the actor's real Master role separately and
-- the monetary writer checks exact version, source revision and authorization.
CREATE FUNCTION public.team_v2_canary_active(p_tournament_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $canary$
 SELECT EXISTS(
   SELECT 1 FROM public.team_v2_canary_tournaments canary
   WHERE canary.tournament_id = p_tournament_id AND canary.enabled IS TRUE
 );
$canary$;
REVOKE EXECUTE ON FUNCTION public.team_v2_canary_active(uuid)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.team_v2_canary_active(uuid) TO service_role;
