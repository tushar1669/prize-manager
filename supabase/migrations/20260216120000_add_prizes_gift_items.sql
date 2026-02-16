-- Add gift_items JSONB to prizes for bundle-aware non-cash comparisons.
ALTER TABLE public.prizes
ADD COLUMN IF NOT EXISTS gift_items jsonb;

UPDATE public.prizes
SET gift_items = '[]'::jsonb
WHERE gift_items IS NULL;

ALTER TABLE public.prizes
ALTER COLUMN gift_items SET DEFAULT '[]'::jsonb,
ALTER COLUMN gift_items SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'prizes_gift_items_is_array_check'
      AND conrelid = 'public.prizes'::regclass
  ) THEN
    ALTER TABLE public.prizes
    ADD CONSTRAINT prizes_gift_items_is_array_check
    CHECK (jsonb_typeof(gift_items) = 'array');
  END IF;
END
$$;

COMMENT ON COLUMN public.prizes.gift_items IS
'Gift items array (jsonb). Presence is derived via jsonb_array_length(gift_items) > 0.';
