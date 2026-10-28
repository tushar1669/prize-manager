-- Stage 3b: import_dedup_candidates is only used by the authenticated Player Import screen.
-- Rollback: GRANT EXECUTE ON FUNCTION public.import_dedup_candidates(jsonb, uuid) TO anon;
REVOKE EXECUTE ON FUNCTION public.import_dedup_candidates(jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_dedup_candidates(jsonb, uuid) TO authenticated, service_role;