-- Seed chess_brochure extraction schema v3.
--
-- Two representational bugs in v2, both of the "unrepresentable, therefore silently wrong" class
-- that D3 documents:
--
-- 1. City vs state: criteria had only `state`, so "Best Jaipur" could only be expressed as
--    state="Jaipur" — a wrong claim the grounding check cannot catch, because "Jaipur" does
--    appear in the text. v3 adds `city`.
-- 2. Grouped ranks: a brochure row like "11 to 15: 6500" forced the model to emit five prize
--    objects with invented places 12–14 that appear nowhere in the document, which grounding then
--    correctly blanked and flagged. v3 adds `rank_from`/`rank_to` so the payload can say exactly
--    what the brochure says; expansion into real prize rows happens at commit time.
--
-- Existing extractions keep pointing at their original schema via extractions.schema_id.
--
-- Reverse with:
--   UPDATE public.extraction_schemas SET is_active = (version = 2) WHERE doc_type = 'chess_brochure';

INSERT INTO public.extraction_schemas (doc_type, version, schema_json, description, is_active)
SELECT
  'chess_brochure',
  3,
  '{
    "type": "object",
    "required": ["tournament_name", "start_date"],
    "properties": {
      "city": { "type": "string" },
      "state": { "type": "string" },
      "venue": { "type": "string" },
      "rounds": { "type": "integer", "description": "Number of rounds" },
      "website": { "type": "string" },
      "end_date": { "type": "string", "format": "date", "description": "YYYY-MM-DD" },
      "organizer": { "type": "string", "description": "Organizing body or person" },
      "aicf_rated": { "type": "boolean" },
      "entry_fees": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "category": { "type": "string", "description": "e.g. General, Rated above 1500" },
            "currency": { "type": "string", "default": "INR" },
            "amount_inr": { "type": "number" }
          }
        }
      },
      "fide_rated": { "type": "boolean" },
      "start_date": { "type": "string", "format": "date", "description": "YYYY-MM-DD" },
      "time_control": {
        "type": "object",
        "properties": {
          "category": { "enum": ["classical", "rapid", "blitz", "bullet"], "type": "string" },
          "base_minutes": { "type": "integer" },
          "increment_seconds": { "type": "integer" }
        }
      },
      "chief_arbiter": { "type": "string" },
      "contact_email": { "type": "string" },
      "contact_phone": { "type": "string" },
      "tournament_name": { "type": "string", "description": "Full tournament title" },
      "prize_categories": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string", "description": "e.g. Open, Under-1500, Under-11 Boys" },
            "prizes": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "place": { "type": "integer", "description": "Single finishing place. Null when the brochure states a range." },
                  "rank_from": { "type": "integer", "description": "First place of a grouped range, e.g. 11 to 15 -> 11. Null for single places." },
                  "rank_to": { "type": "integer", "description": "Last place of a grouped range, e.g. 11 to 15 -> 15. Null for single places." },
                  "has_medal": { "type": "boolean" },
                  "has_trophy": { "type": "boolean" },
                  "cash_amount": { "type": "number", "description": "Cash for ONE place (a range pays this per place)" },
                  "gift_description": { "type": "string" }
                }
              }
            },
            "is_main": { "type": "boolean" },
            "criteria": {
              "type": "object",
              "description": "Machine-readable eligibility rules derived from the category name.",
              "properties": {
                "gender": { "enum": ["male", "female", "any"], "type": "string", "description": "e.g. Best Female -> female" },
                "age_min": { "type": "integer", "description": "Minimum age, e.g. Veteran +55 -> 55" },
                "age_max": { "type": "integer", "description": "Maximum age, e.g. Under-16 -> 16" },
                "rating_max": { "type": "integer", "description": "e.g. Rating 1401-1650 -> 1650" },
                "rating_min": { "type": "integer", "description": "e.g. Rating 1401-1650 -> 1401" },
                "city": { "type": "string", "description": "City eligibility, e.g. Best Jaipur -> Jaipur" },
                "state": { "type": "string", "description": "State/province eligibility, e.g. Best Rajasthan -> Rajasthan. Never a city." }
              }
            }
          }
        }
      },
      "total_prize_fund": { "type": "number", "description": "Total cash prize fund" },
      "tournament_director": { "type": "string" },
      "registration_deadline": { "type": "string", "format": "date" }
    }
  }'::jsonb,
  'Chess brochure v3 - adds criteria.city (city vs state) and prize rank_from/rank_to (grouped ranks without invented places)',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.extraction_schemas WHERE doc_type = 'chess_brochure' AND version = 3
);

-- Exactly one active schema per doc_type; the extractor reads whichever is active.
UPDATE public.extraction_schemas
   SET is_active = false
 WHERE doc_type = 'chess_brochure'
   AND version <> 3;
