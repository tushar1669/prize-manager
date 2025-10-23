-- Idempotent migration: Add unique constraint on (category_id, place) if no duplicates exist
DO $$
DECLARE dup_count int;
BEGIN
  -- Check for existing duplicates
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT category_id, place
    FROM public.prizes
    GROUP BY 1,2
    HAVING COUNT(*) > 1
  ) d;

  IF dup_count > 0 THEN
    RAISE NOTICE 'Skipping unique index: % duplicates exist. Please deduplicate and re-run.', dup_count;
  ELSE
    -- Create unique index if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND indexname = 'prizes_category_id_place_key'
    ) THEN
      CREATE UNIQUE INDEX prizes_category_id_place_key ON public.prizes(category_id, place);
      RAISE NOTICE 'Created unique index prizes_category_id_place_key';
    ELSE
      RAISE NOTICE 'Index prizes_category_id_place_key already exists';
    END IF;
  END IF;
END $$;