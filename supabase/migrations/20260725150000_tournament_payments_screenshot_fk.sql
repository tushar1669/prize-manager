-- Add screenshot_extraction_id to tournament_payments (Phase 2A).
-- Nullable: screenshot upload is optional during the initial rollout.
-- ON DELETE SET NULL: deleting an extraction never deletes the payment claim.

ALTER TABLE public.tournament_payments
  ADD COLUMN IF NOT EXISTS screenshot_extraction_id uuid
  REFERENCES public.extractions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tournament_payments_extraction
  ON public.tournament_payments (screenshot_extraction_id)
  WHERE screenshot_extraction_id IS NOT NULL;
