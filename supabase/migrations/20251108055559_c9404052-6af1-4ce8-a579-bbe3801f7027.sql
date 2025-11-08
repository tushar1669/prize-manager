-- Add fide_id column to players table for Swiss-Manager imports

-- Add fide_id column if it doesn't exist
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS fide_id text;

-- Add partial index for performance (only non-null values)
CREATE INDEX IF NOT EXISTS idx_players_fide_id 
  ON public.players (fide_id) 
  WHERE fide_id IS NOT NULL;
