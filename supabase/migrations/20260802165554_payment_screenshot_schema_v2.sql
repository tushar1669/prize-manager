-- Phase 2A-3, prerequisite F0b: payment_screenshot extraction schema v2.
--
-- Adds three fields identified from real PhonePe receipts (architecture D23):
--   direction_label — feeds the direction_not_outgoing invariant (F0c)
--   payee_name      — recipient display name, distinct from payer_name
--   txn_id          — app transaction ID, distinct from UTR; doubles the
--                     duplicate-detection surface
--
-- DEVIATION FROM D23 (deliberate). D23 specified `direction` as a normalised
-- enum "outgoing"/"incoming". That cannot work with this trust layer:
-- trustCheck.ts grounds unknown string leaves via groundString against the OCR
-- text and blanks anything ungrounded (trustCheck.ts:297-306). The words
-- "outgoing"/"incoming" appear nowhere on a UPI receipt — PhonePe prints
-- "Paid to" / "Received from" — so a normalised value would be blanked to null
-- on EVERY screenshot, and direction_not_outgoing (which flags incoming OR
-- absent) would fire 100% of the time, making auto-approval unreachable.
--
-- Exempting the field from grounding was rejected: that feeds ungrounded model
-- output straight into a security invariant.
--
-- Instead the field captures the label VERBATIM, so groundString matches the
-- literal receipt text, and F0c normalises to outgoing/incoming in TypeScript.
-- The model transcribes; the trust layer judges. Renamed direction_label to
-- make the verbatim semantics unmistakable at the call site.
--
-- `required` is intentionally UNCHANGED at [amount_inr, utr]. Widening it would
-- alter the auto_ok/confidence computation (trustCheck.ts:400) as a side effect.
-- Enforcement of the new fields belongs in the F0c invariants, where it is
-- explicit and unit-testable.
--
-- Rollback: update extraction_schemas set is_active = (version = 1)
--           where doc_type = 'payment_screenshot';

update public.extraction_schemas
   set is_active = false
 where doc_type = 'payment_screenshot'
   and version = 1;

insert into public.extraction_schemas (doc_type, version, is_active, description, schema_json)
values (
  'payment_screenshot',
  2,
  true,
  'Phase 2A-3: UPI payment screenshot verification. Adds direction_label, payee_name, txn_id for the direction/VPA/required-field trust invariants.',
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
        'description', 'UPI VPA or UPI ID of the recipient for example merchant@upi'
      ),
      'amount_inr', jsonb_build_object(
        'type', 'number',
        'description', 'Payment amount in Indian Rupees as a number without currency symbols'
      ),
      'payer_name', jsonb_build_object(
        'type', 'string',
        'description', 'Name of the person who sent the payment'
      ),
      'payee_name', jsonb_build_object(
        'type', 'string',
        'description', 'Display name of the party who RECEIVED the money as printed on the receipt for example a shop or person name. This is not the sender'
      ),
      'direction_label', jsonb_build_object(
        'type', 'string',
        'description', 'The exact words printed immediately above or beside the counterparty name indicating money flow for example Paid to or Received from or Money sent to. Copy the wording VERBATIM exactly as printed. Do not translate normalise summarise or replace it with words like outgoing or incoming'
      ),
      'txn_id', jsonb_build_object(
        'type', 'string',
        'description', 'App specific transaction identifier shown separately from the UTR for example a PhonePe Transaction ID beginning with the letter T'
      ),
      'status_text', jsonb_build_object(
        'type', 'string',
        'description', 'Payment status as shown in the app for example Payment Successful or Completed'
      )
    )
  )
);
