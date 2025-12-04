-- Add category_type to categories to support special prize handling (e.g., youngest prizes)
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS category_type text NOT NULL DEFAULT 'standard';

COMMENT ON COLUMN public.categories.category_type IS 'Category type: standard | youngest_male | youngest_female';
