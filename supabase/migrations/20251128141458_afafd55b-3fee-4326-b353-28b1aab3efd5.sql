-- Remove legacy dob_on_or_after from all categories' criteria_json
-- The allocator uses min_age/max_age for age rules, not dob_on_or_after

UPDATE public.categories
SET criteria_json = criteria_json - 'dob_on_or_after'
WHERE criteria_json ? 'dob_on_or_after';