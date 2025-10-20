-- Add optional columns for disability and special notes to players table
ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS disability TEXT,
ADD COLUMN IF NOT EXISTS special_notes TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.players.disability IS 'Disability type: Hearing, Visual, Physical, Intellectual, etc.';
COMMENT ON COLUMN public.players.special_notes IS 'Special accommodations, dietary requirements, or other notes';