CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  imported_by uuid NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),

  filename text NULL,
  file_hash text NULL,
  source text NULL CHECK (source IN ('swiss-manager','organizer-template','unknown')),
  sheet_name text NULL,
  header_row integer NULL,

  total_rows integer NOT NULL DEFAULT 0,
  accepted_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  duration_ms integer NULL,

  top_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS import_logs_tournament_at_idx ON public.import_logs (tournament_id, imported_at DESC);
CREATE INDEX IF NOT EXISTS import_logs_file_hash_idx ON public.import_logs (file_hash);
CREATE INDEX IF NOT EXISTS import_logs_tournament_hash_idx ON public.import_logs (tournament_id, file_hash);

ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='import_logs' AND policyname='import_logs_select_owner'
  ) THEN
    CREATE POLICY import_logs_select_owner
    ON public.import_logs FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.tournaments t
        WHERE t.id = import_logs.tournament_id
          AND (t.owner_id = auth.uid() OR public.has_role(auth.uid(), 'master'))
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='import_logs' AND policyname='import_logs_insert_owner'
  ) THEN
    CREATE POLICY import_logs_insert_owner
    ON public.import_logs FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.tournaments t
        WHERE t.id = import_logs.tournament_id
          AND (t.owner_id = auth.uid() OR public.has_role(auth.uid(), 'master'))
      )
    );
  END IF;
END $$;

REVOKE ALL ON TABLE public.import_logs FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public.import_logs TO authenticated;