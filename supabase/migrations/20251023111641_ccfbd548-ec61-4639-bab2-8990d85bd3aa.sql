-- Add is_active flags to categories and prizes (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='categories' AND column_name='is_active'
  ) THEN
    ALTER TABLE public.categories ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='prizes' AND column_name='is_active'
  ) THEN
    ALTER TABLE public.prizes ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
END $$;