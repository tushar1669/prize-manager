-- Add tournament metadata fields for FIDE-style classification and organizer info
-- All fields are nullable to maintain backward compatibility with existing tournaments

ALTER TABLE public.tournaments
ADD COLUMN IF NOT EXISTS time_control_base_minutes integer,
ADD COLUMN IF NOT EXISTS time_control_increment_seconds integer,
ADD COLUMN IF NOT EXISTS time_control_category text,
ADD COLUMN IF NOT EXISTS chief_arbiter text,
ADD COLUMN IF NOT EXISTS tournament_director text,
ADD COLUMN IF NOT EXISTS entry_fee_amount numeric(10,2),
ADD COLUMN IF NOT EXISTS cash_prize_total numeric(10,2);