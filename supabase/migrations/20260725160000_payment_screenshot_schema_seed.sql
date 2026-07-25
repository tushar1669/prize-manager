-- Seed extraction_schemas for payment_screenshot doc_type (Phase 2A).
-- This schema drives the Gemini structured-extraction pass for UPI screenshots.
-- amount_inr and utr are required; all other fields are optional.

-- NOTE: extraction_schemas has a `description` column (there is no `notes` column);
-- the free-text label is stored in `description`.
INSERT INTO public.extraction_schemas (doc_type, version, schema_json, is_active, description)
VALUES (
  'payment_screenshot',
  1,
  '{"type":"object","required":["amount_inr","utr"],"properties":{"amount_inr":{"type":"number","description":"Payment amount in Indian Rupees as a number without currency symbols"},"utr":{"type":"string","description":"UPI Transaction Reference or UTR number typically 12 to 22 alphanumeric characters"},"txn_date":{"type":"string","format":"date","description":"Transaction date in YYYY-MM-DD format"},"payee_vpa":{"type":"string","description":"UPI VPA or UPI ID of the recipient for example merchant@upi"},"payer_name":{"type":"string","description":"Name of the person who sent the payment"},"status_text":{"type":"string","description":"Payment status as shown in the app for example Payment Successful or Completed"},"app":{"type":"string","description":"UPI app used: GPay PhonePe Paytm BHIM or other"}}}',
  true,
  'Phase 2A: UPI payment screenshot verification'
)
ON CONFLICT (doc_type, version) DO NOTHING;
