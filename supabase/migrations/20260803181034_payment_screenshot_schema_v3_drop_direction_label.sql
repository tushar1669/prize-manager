-- Phase 2A-3, F0b follow-up: payment_screenshot schema v3.
--
-- Removes direction_label, added in v2. Three real fixtures killed it:
--   PhonePe outgoing (Rs43)  -> null                (+ HIGH "ungrounded" flag)
--   GPay    outgoing (Rs1)   -> "Recipient Name:"   (grounded, meaningless)
--   PhonePe incoming (Rs1)   -> "Credited to"       (grounded, correct)
--
-- Two failures matter. It is inconsistent across apps, so it cannot carry a
-- security invariant. And on a LEGITIMATE outgoing PhonePe payment it fired a
-- high-severity ungrounded flag — a false positive that would block
-- auto-approval for real paying customers. Keeping it is worse than not having
-- it.
--
-- Replacement (F0c): direction is derived by deterministic regex over
-- extraction_documents.ocr_text, which F0a made immutable to clients, so the
-- signal is both consistent and tamper-resistant. The model no longer gets a
-- vote on direction at all.
--
-- payee_name and txn_id are RETAINED — both grounded correctly on every
-- fixture and carry real evidentiary value.
--
-- Rollback: update extraction_schemas set is_active = (version = 2)
--           where doc_type = 'payment_screenshot';

update public.extraction_schemas
   set is_active = false
 where doc_type = 'payment_screenshot'
   and version = 2;

insert into public.extraction_schemas (doc_type, version, is_active, description, schema_json)
values (
  'payment_screenshot',
  3,
  true,
  'Phase 2A-3: UPI payment screenshot verification. Drops direction_label (inconsistent across apps, false-positived on legitimate payments); direction now derived by regex over ocr_text in F0c. Retains payee_name and txn_id.',
  jsonb_build_object(
    'type', 'object',
    'required', jsonb_build_array('amount_inr', 'utr'),
    'properties', jsonb_build_object(
      'app', jsonb_build_object(
        'type', 'string',
        'description', 'UPI app used: GPay PhonePe Paytm BHIM or other'
      ),
      'utr', jsonb_build_object(
        'type', 'string',
        'description', 'UPI Transaction Reference or UTR number typically 12 to 22 alphanumeric characters'
      ),
      'txn_date', jsonb_build_object(
        'type', 'string',
        'format', 'date',
        'description', 'Transaction date in YYYY-MM-DD format'
      ),
      'payee_vpa', jsonb_build_object(
        'type', 'string',
        'description', 'UPI VPA or UPI ID of the party who RECEIVED the money for example merchant@upi. Leave null if the receipt shows only a masked bank account number for the recipient rather than a UPI ID'
      ),
      'amount_inr', jsonb_build_object(
        'type', 'number',
        'description', 'Payment amount in Indian Rupees as a number without currency symbols'
      ),
      'payer_name', jsonb_build_object(
        'type', 'string',
        'description', 'Name of the party who SENT the money'
      ),
      'payee_name', jsonb_build_object(
        'type', 'string',
        'description', 'Display name of the party who RECEIVED the money as printed on the receipt for example a shop or person name. This is not the sender'
      ),
      'txn_id', jsonb_build_object(
        'type', 'string',
        'description', 'App specific transaction identifier shown separately from the UTR for example a PhonePe Transaction ID beginning with the letter T or a Google transaction ID'
      ),
      'status_text', jsonb_build_object(
        'type', 'string',
        'description', 'Payment status as shown in the app for example Payment Successful or Completed'
      )
    )
  )
);
