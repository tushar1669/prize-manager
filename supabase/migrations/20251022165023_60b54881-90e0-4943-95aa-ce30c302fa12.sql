-- Align DB schema with import template & validation schema
ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS city text;

COMMENT ON COLUMN public.players.city IS 'Player city for display/filtering; optional';