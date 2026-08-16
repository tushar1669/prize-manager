-- Client write-grant audit, Step 4 (D38).
--
-- These grants are already unusable: every table below has RLS enabled with
-- ZERO write policies, so client writes are refused today. Removing the grants
-- is therefore a provable no-op in behaviour -- a stronger guarantee than a HAR
-- capture, which shows only one session. If any code path depended on these,
-- it would already be broken in production.
--
-- Why remove them at all: they are one accidental "add a policy" away from
-- being live. Defence in depth, and it shrinks the surface a future audit has
-- to re-examine.
--
-- SELECT is deliberately NOT touched anywhere in this migration. Several of
-- these tables are legitimately read by the client or by master-read policies.
-- Scope is write privileges only.
--
-- master_allowlist is DELIBERATELY EXCLUDED. Its grants are equally dead, but
-- it sits on the master/admin role-resolution path (guardrail M1) and requires
-- an explicit exception. Tracked in PROJECT_STATE.

-- ── Group 1: fully dead. No write policy, no code path, no exceptions. ───────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'extraction_schemas',
    'payment_notification_outbox',
    'referrals',
    'referral_codes',
    'referral_rewards',
    'welcome_onboarding_rewards'
  ] LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
  END LOOP;
END $$;

-- ── Group 2: extractions ────────────────────────────────────────────────────
-- UPDATE is NOT revoked. F0a/D29 left authenticated with column-level UPDATE on
-- payload, status, updated_at only, and BrochureReview.tsx writes both payload
-- and status. Revoking table UPDATE here would not remove the column grants,
-- but it would be misleading; the point is that INSERT and DELETE were never
-- used and have no policy behind them.
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.extractions
  FROM PUBLIC, anon, authenticated;

-- ── Group 3: extraction_documents ───────────────────────────────────────────
-- INSERT is RETAINED for authenticated: BrochureImportDialog.tsx:131 and
-- TournamentUpgrade.tsx:355 both insert their own rows under the
-- "Users can insert own documents" policy. anon loses it -- uploads require a
-- session, so anon INSERT was never reachable.
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.extraction_documents
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT ON TABLE public.extraction_documents FROM PUBLIC, anon;

-- ── Self-verify: prove the live paths survived, not just that grants went ────
DO $$
DECLARE t text; v_bad text := '';
BEGIN
  -- Group 1 + extractions INSERT/DELETE must be gone for both client roles
  FOREACH t IN ARRAY ARRAY[
    'extraction_schemas','payment_notification_outbox','referrals',
    'referral_codes','referral_rewards','welcome_onboarding_rewards'
  ] LOOP
    IF has_table_privilege('authenticated','public.'||t,'INSERT')
       OR has_table_privilege('authenticated','public.'||t,'UPDATE')
       OR has_table_privilege('authenticated','public.'||t,'DELETE')
       OR has_table_privilege('anon','public.'||t,'INSERT')
       OR has_table_privilege('anon','public.'||t,'UPDATE')
       OR has_table_privilege('anon','public.'||t,'DELETE') THEN
      v_bad := v_bad || t || ' ';
    END IF;
  END LOOP;
  IF v_bad <> '' THEN
    RAISE EXCEPTION 'REVOKE INCOMPLETE on: %', v_bad;
  END IF;

  IF has_table_privilege('authenticated','public.extractions','INSERT')
     OR has_table_privilege('authenticated','public.extractions','DELETE')
     OR has_table_privilege('anon','public.extractions','INSERT') THEN
    RAISE EXCEPTION 'REVOKE INCOMPLETE on extractions';
  END IF;

  IF has_table_privilege('authenticated','public.extraction_documents','DELETE')
     OR has_table_privilege('anon','public.extraction_documents','INSERT') THEN
    RAISE EXCEPTION 'REVOKE INCOMPLETE on extraction_documents';
  END IF;

  -- The two live paths MUST still work
  IF NOT has_table_privilege('authenticated','public.extraction_documents','INSERT') THEN
    RAISE EXCEPTION 'BROKE BROCHURE/PAYMENT UPLOAD: authenticated lost INSERT on extraction_documents';
  END IF;

  IF NOT has_column_privilege('authenticated','public.extractions','payload','UPDATE')
     OR NOT has_column_privilege('authenticated','public.extractions','status','UPDATE')
     OR NOT has_column_privilege('authenticated','public.extractions','updated_at','UPDATE') THEN
    RAISE EXCEPTION 'BROKE BROCHURE REVIEW: authenticated lost column UPDATE on extractions';
  END IF;

  -- F0a/D29 must remain intact: no wider column grants crept in
  IF has_column_privilege('authenticated','public.extractions','document_id','UPDATE') THEN
    RAISE EXCEPTION 'D29 VIOLATED: authenticated can update extractions.document_id';
  END IF;

  RAISE NOTICE 'OK: dead write grants removed, live paths intact, D29 intact';
END $$;
