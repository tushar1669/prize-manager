-- PHASE G: schema v5 adds detected_tournament_names (multi-event chooser, Option A).
--
-- When a brochure bundles multiple events, v4 only signals the fact (multiple_tournaments_detected).
-- v5 adds the list of the distinct event names the model found, so the review screen can offer the
-- organizer a chooser and trigger a targeted re-extraction for the event they want.
--
-- Schemas are versioned, never edited in place: seed v5 as a new active row (derived from v4 so the
-- rest of the schema cannot drift) and retire v4.

INSERT INTO public.extraction_schemas (doc_type, version, schema_json, description, is_active)
SELECT
  'chess_brochure',
  5,
  jsonb_set(
    schema_json,
    '{properties,detected_tournament_names}',
    '{"type":"array","items":{"type":"string"},"description":"When multiple_tournaments_detected is true, list the exact name of every distinct event found in the brochure (e.g. [''3rd Open Rapid Tournament 2025'', ''3rd Open Blitz Tournament 2025'']). Use the official names as printed on the brochure. Empty array [] when only one event exists."}'::jsonb
  ),
  'v5: adds detected_tournament_names array (multi-event chooser)',
  true
FROM public.extraction_schemas
WHERE doc_type = 'chess_brochure' AND version = 4;

UPDATE public.extraction_schemas
   SET is_active = false
 WHERE doc_type = 'chess_brochure' AND version = 4;
