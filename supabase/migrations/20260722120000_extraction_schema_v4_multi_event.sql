-- FIX 3 (C3): schema v4 adds a top-level multiple_tournaments_detected flag.
--
-- Some brochures bundle two distinct events (e.g. Kurnool's "Rapid & Blitz"). The engine extracts
-- only the primary event; this flag lets the review screen tell the organizer the others were left
-- out. v4 is v3 plus one boolean property — derived from v3 so the rest of the schema cannot drift.
--
-- Schemas are versioned, never edited in place: seed v4 as a new active row and retire v3.

INSERT INTO public.extraction_schemas (doc_type, version, schema_json, description, is_active)
SELECT
  'chess_brochure',
  4,
  jsonb_set(
    schema_json,
    '{properties,multiple_tournaments_detected}',
    '{"type":"boolean","description":"True if the brochure bundles more than one distinct tournament/event (e.g. Rapid + Blitz, Day 1 / Day 2, Tournament 1 / 2). Only the primary/main event is extracted into the other fields."}'::jsonb
  ),
  'v4: adds multiple_tournaments_detected top-level flag (multi-event brochure signal)',
  true
FROM public.extraction_schemas
WHERE doc_type = 'chess_brochure' AND version = 3;

UPDATE public.extraction_schemas
   SET is_active = false
 WHERE doc_type = 'chess_brochure' AND version = 3;
