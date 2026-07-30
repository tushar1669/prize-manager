-- Phase 2A-2, step 3b-2a: masters could not read extraction rows under RLS.
--
-- public.extractions and public.extraction_documents each carried only a
-- "Users can view own ..." SELECT policy scoped to uploaded_by = auth.uid().
-- A master reviewing a payment claim submitted by a different user therefore
-- got an empty array at HTTP 200 and the admin evidence panel rendered nothing.
--
-- The equivalent master policy already exists on storage.objects
-- ("Masters read all extraction files", 20260729120000); it was never added to
-- the two tables. Naming here deliberately mirrors that policy.
--
-- RLS policies are permissive and OR together, so the existing
-- "Users can view own ..." policies keep working untouched. Unscoped by
-- doc_type on purpose: masters need brochure oversight too, and the storage
-- policy is already unscoped.

drop policy if exists "Masters read all extraction documents" on public.extraction_documents;
create policy "Masters read all extraction documents"
  on public.extraction_documents for select to authenticated
  using (public.is_master());

drop policy if exists "Masters read all extractions" on public.extractions;
create policy "Masters read all extractions"
  on public.extractions for select to authenticated
  using (public.is_master());
