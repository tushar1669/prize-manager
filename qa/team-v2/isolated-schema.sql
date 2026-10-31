-- Synthetic *ephemeral* Postgres fixture only. Do not run on production.
-- Intentionally creates only the columns/roles required by the real draft RPC.
CREATE ROLE service_role NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE TYPE public.app_role AS ENUM ('master','organizer');
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE TABLE public.tournaments (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL,
  updated_at timestamptz
);
CREATE TABLE public.players (
  id uuid PRIMARY KEY, tournament_id uuid NOT NULL, points numeric,
  team text, club text, city text, state text, group_label text, type_label text
);

-- Production's existing statement-level player import watermark, not a V2
-- migration. Mirror the catalog shape and handler only in ephemeral CI.
CREATE TABLE public.tournament_player_watermark (
  tournament_id uuid PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE CASCADE,
  players_count_max integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.tg_players_bump_watermark()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $watermark$
BEGIN
  INSERT INTO public.tournament_player_watermark AS w
    (tournament_id, players_count_max, updated_at)
  SELECT s.tid,
         (SELECT count(*) FROM public.players p WHERE p.tournament_id = s.tid),
         now()
  FROM (SELECT DISTINCT tournament_id AS tid FROM new_players WHERE tournament_id IS NOT NULL) s
  ON CONFLICT (tournament_id) DO UPDATE
    SET players_count_max = GREATEST(w.players_count_max, EXCLUDED.players_count_max),
        updated_at = now();
  RETURN NULL;
END;
$watermark$;
CREATE TRIGGER trg_players_bump_watermark_ins
AFTER INSERT ON public.players REFERENCING NEW TABLE AS new_players
FOR EACH STATEMENT EXECUTE FUNCTION public.tg_players_bump_watermark();
CREATE TRIGGER trg_players_bump_watermark_upd
AFTER UPDATE ON public.players REFERENCING NEW TABLE AS new_players
FOR EACH STATEMENT EXECUTE FUNCTION public.tg_players_bump_watermark();
CREATE TABLE public.categories (
  id uuid PRIMARY KEY, tournament_id uuid NOT NULL, is_active boolean NOT NULL
);
CREATE TABLE public.prizes (
  id uuid PRIMARY KEY, category_id uuid NOT NULL, is_active boolean NOT NULL
);
-- Match production: rule_config is keyed by tournament_id and has NO id.
-- The old synthetic id column hid a production-only SQL compilation failure.
CREATE TABLE public.rule_config (
 tournament_id uuid PRIMARY KEY, strict_age boolean
);
CREATE TABLE public.allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL, version integer NOT NULL,
  prize_id uuid NOT NULL, player_id uuid NOT NULL, reason_codes text[] NOT NULL DEFAULT '{}',
  is_manual boolean, decided_by uuid, decided_at timestamptz
);
-- Production has a non-unique lookup index, not a per-prize unique key.
-- Duplicate award rejection is exercised in the atomic writer contract.
CREATE INDEX idx_allocations_tournament_version
  ON public.allocations(tournament_id,version);
CREATE TABLE public.institution_prize_groups (
  id uuid PRIMARY KEY, tournament_id uuid NOT NULL, name text NOT NULL,
  group_by text NOT NULL, team_size integer NOT NULL,
  female_slots integer NOT NULL, male_slots integer NOT NULL,
  scoring_mode text NOT NULL, is_active boolean NOT NULL
);
CREATE TABLE public.institution_prizes (
  id uuid PRIMARY KEY, group_id uuid NOT NULL, place integer NOT NULL,
  cash_amount numeric NOT NULL, has_trophy boolean NOT NULL,
  has_medal boolean NOT NULL, is_active boolean NOT NULL
);
CREATE TABLE public.team_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL, version integer NOT NULL,
  group_id uuid NOT NULL, prize_id uuid NOT NULL, place integer NOT NULL,
  institution_key text NOT NULL, total_points numeric NOT NULL,
  player_ids uuid[] NOT NULL, player_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tournament_id,version,group_id,place)
);
CREATE TABLE public.publications (
  tournament_id uuid NOT NULL, allocation_version integer NOT NULL, is_active boolean NOT NULL
);
CREATE SCHEMA qa;
-- Test roles only: never recreate service role or unrestricted grants in production.
GRANT USAGE ON SCHEMA public,qa TO service_role, authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,public.app_role) TO service_role;
