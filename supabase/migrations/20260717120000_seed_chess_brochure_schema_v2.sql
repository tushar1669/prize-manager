-- Seed chess_brochure extraction schema v2.
--
-- v1's prize category `criteria` object could only express gender/age_max/rating_min/rating_max.
-- Structured output constrains the model to the schema it is given, so eligibility rules like
-- "Best Rajasthan" and "Veteran +55" were not merely missed -- they were unrepresentable.
-- v2 adds `state` and `age_min`. Existing extractions keep pointing at the v1 row via
-- extractions.schema_id, so history stays intact.
--
-- Reverse with:
--   UPDATE public.extraction_schemas SET is_active = (version = 1) WHERE doc_type = 'chess_brochure';

INSERT INTO public.extraction_schemas (doc_type, version, schema_json, description, is_active)
SELECT
  'chess_brochure',
  2,
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
                  "place": { "type": "integer" },
                  "has_medal": { "type": "boolean" },
                  "has_trophy": { "type": "boolean" },
                  "cash_amount": { "type": "number" },
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
                "state": { "type": "string", "description": "State eligibility, e.g. Best Rajasthan -> Rajasthan" }
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
  'Chess brochure v2 - adds machine-readable criteria.state and criteria.age_min',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.extraction_schemas WHERE doc_type = 'chess_brochure' AND version = 2
);

-- Exactly one active schema per doc_type; the extractor reads whichever is active.
UPDATE public.extraction_schemas
   SET is_active = false
 WHERE doc_type = 'chess_brochure'
   AND version <> 2;
