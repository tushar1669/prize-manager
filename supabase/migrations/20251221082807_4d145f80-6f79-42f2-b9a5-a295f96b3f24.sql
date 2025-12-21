-- Migration: Fix duplicate main categories + prevent future duplicates
-- This migration is IDEMPOTENT and SAFE to run multiple times

-- STEP 1: Cleanup duplicate main categories for each tournament
-- Strategy: Keep OLDEST main category per tournament (by created_at), move prizes from others, delete extras

DO $$
DECLARE
  t_rec RECORD;
  keeper_id UUID;
  dup_id UUID;
BEGIN
  -- Loop through tournaments that have >1 main category
  FOR t_rec IN 
    SELECT tournament_id 
    FROM categories 
    WHERE is_main = true 
    GROUP BY tournament_id 
    HAVING COUNT(*) > 1
  LOOP
    RAISE NOTICE 'Processing tournament %', t_rec.tournament_id;
    
    -- Get the OLDEST main category (keeper)
    SELECT id INTO keeper_id
    FROM categories
    WHERE tournament_id = t_rec.tournament_id
      AND is_main = true
    ORDER BY created_at ASC
    LIMIT 1;
    
    RAISE NOTICE '  Keeper category: %', keeper_id;
    
    -- Move prizes from duplicate main categories to keeper
    -- First, get the max place in keeper so we can append
    UPDATE prizes
    SET category_id = keeper_id
    WHERE category_id IN (
      SELECT id FROM categories 
      WHERE tournament_id = t_rec.tournament_id 
        AND is_main = true 
        AND id != keeper_id
    );
    
    RAISE NOTICE '  Moved prizes to keeper';
    
    -- Delete the duplicate main categories (not the keeper)
    DELETE FROM categories
    WHERE tournament_id = t_rec.tournament_id
      AND is_main = true
      AND id != keeper_id;
    
    RAISE NOTICE '  Deleted duplicate main categories';
  END LOOP;
END $$;

-- STEP 2: Verify no duplicates remain
DO $$
DECLARE
  dup_count INT;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT tournament_id 
    FROM categories 
    WHERE is_main = true 
    GROUP BY tournament_id 
    HAVING COUNT(*) > 1
  ) AS dups;
  
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Cleanup failed: % tournaments still have duplicate main categories', dup_count;
  END IF;
  
  RAISE NOTICE 'Cleanup verified: no duplicate main categories remain';
END $$;

-- STEP 3: Add partial unique index to prevent future duplicates
-- DROP IF EXISTS allows re-running this migration safely
DROP INDEX IF EXISTS categories_unique_main_per_tournament;

CREATE UNIQUE INDEX categories_unique_main_per_tournament 
  ON categories (tournament_id) 
  WHERE is_main = true;

-- Verify index was created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'categories_unique_main_per_tournament'
  ) THEN
    RAISE EXCEPTION 'Failed to create unique index';
  END IF;
  RAISE NOTICE 'Unique index created successfully';
END $$;