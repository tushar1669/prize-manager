-- BASELINE: public.tournament_payments
-- This table was created directly in the live Supabase project, not through
-- a migration. This file captures the DDL for version control so that
-- supabase db reset builds it correctly.
-- All statements use IF NOT EXISTS / EXCEPTION guards — safe on the live DB.

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.tournament_payments (
  id             uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  uuid                  NOT NULL REFERENCES public.tournaments(id),
  user_id        uuid                  NOT NULL,
  amount_inr     integer               NOT NULL,
  utr            text                  NOT NULL,
  status         public.payment_status NOT NULL DEFAULT 'pending',
  review_note    text,
  reviewed_by    uuid,
  reviewed_at    timestamptz,
  created_at     timestamptz           NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_payments_pending
  ON public.tournament_payments (tournament_id, user_id)
  WHERE (status = 'pending');

CREATE INDEX IF NOT EXISTS idx_tournament_payments_status_created
  ON public.tournament_payments (status, created_at DESC);

ALTER TABLE public.tournament_payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY users_insert_own_payments
    ON public.tournament_payments FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY users_read_own_payments
    ON public.tournament_payments FOR SELECT TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY users_update_own_pending_payments
    ON public.tournament_payments FOR UPDATE TO authenticated
    USING ((user_id = auth.uid()) AND (status = 'pending'))
    WITH CHECK ((user_id = auth.uid()) AND (status = 'pending'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY master_full_payments
    ON public.tournament_payments FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'master'))
    WITH CHECK (public.has_role(auth.uid(), 'master'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
