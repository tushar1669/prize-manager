
-- Phase 0: Repo parity migration — mirrors live Supabase schema
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS guards)

-- 1) players columns
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS team text;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS points numeric;

-- 2) team_allocations table
CREATE TABLE IF NOT EXISTS public.team_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL,
  version integer NOT NULL,
  group_id uuid NOT NULL,
  prize_id uuid NOT NULL,
  place integer NOT NULL,
  institution_key text NOT NULL,
  total_points numeric NOT NULL DEFAULT 0,
  player_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  player_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_allocations_pkey PRIMARY KEY (id),
  CONSTRAINT team_allocations_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE,
  CONSTRAINT team_allocations_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.institution_prize_groups(id) ON DELETE CASCADE,
  CONSTRAINT team_allocations_prize_id_fkey FOREIGN KEY (prize_id) REFERENCES public.institution_prizes(id) ON DELETE CASCADE,
  CONSTRAINT team_allocations_tournament_version_group_place_key UNIQUE (tournament_id, version, group_id, place)
);

CREATE INDEX IF NOT EXISTS idx_team_alloc_tid_ver ON public.team_allocations(tournament_id, version);
ALTER TABLE public.team_allocations ENABLE ROW LEVEL SECURITY;

-- 3) team_allocation_notes table
CREATE TABLE IF NOT EXISTS public.team_allocation_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL,
  version integer NOT NULL,
  group_id uuid NOT NULL,
  note text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_allocation_notes_pkey PRIMARY KEY (id),
  CONSTRAINT team_allocation_notes_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE,
  CONSTRAINT team_allocation_notes_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.institution_prize_groups(id) ON DELETE CASCADE,
  CONSTRAINT team_allocation_notes_tournament_version_group_key UNIQUE (tournament_id, version, group_id)
);

ALTER TABLE public.team_allocation_notes ENABLE ROW LEVEL SECURITY;
