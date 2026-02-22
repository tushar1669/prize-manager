
-- 1. Table
CREATE TABLE public.tournament_manual_prizes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  title           text NOT NULL,
  winner_name     text NOT NULL,
  prize_value     text,
  sponsor         text,
  notes           text,
  sort_order      integer NOT NULL DEFAULT 0,
  is_visible      boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 2. Index
CREATE INDEX idx_manual_prizes_tournament_sort
  ON public.tournament_manual_prizes (tournament_id, sort_order);

-- 3. RLS
ALTER TABLE public.tournament_manual_prizes ENABLE ROW LEVEL SECURITY;

-- 4. Owner/master READ (authenticated)
CREATE POLICY org_manual_prizes_read
  ON public.tournament_manual_prizes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_manual_prizes.tournament_id
        AND (t.owner_id = auth.uid() OR has_role(auth.uid(), 'master'::public.app_role))
    )
  );

-- 5. Owner/master WRITE — Pro-only (active entitlement or master)
CREATE POLICY org_manual_prizes_write
  ON public.tournament_manual_prizes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_manual_prizes.tournament_id
        AND (
          has_role(auth.uid(), 'master'::public.app_role)
          OR (
            t.owner_id = auth.uid()
            AND EXISTS (
              SELECT 1 FROM public.tournament_entitlements te
              WHERE te.tournament_id = t.id
                AND (te.starts_at IS NULL OR now() >= te.starts_at)
                AND (te.ends_at IS NULL OR now() < te.ends_at)
            )
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_manual_prizes.tournament_id
        AND (
          has_role(auth.uid(), 'master'::public.app_role)
          OR (
            t.owner_id = auth.uid()
            AND EXISTS (
              SELECT 1 FROM public.tournament_entitlements te
              WHERE te.tournament_id = t.id
                AND (te.starts_at IS NULL OR now() >= te.starts_at)
                AND (te.ends_at IS NULL OR now() < te.ends_at)
            )
          )
        )
    )
  );

-- 6. Anonymous READ — published + visible only
CREATE POLICY anon_read_published_manual_prizes
  ON public.tournament_manual_prizes
  FOR SELECT
  USING (
    is_visible = true
    AND EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_manual_prizes.tournament_id
        AND t.is_published = true
    )
  );

-- 7. updated_at trigger
CREATE TRIGGER set_manual_prizes_updated_at
  BEFORE UPDATE ON public.tournament_manual_prizes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
