-- Phase 2A-3, prerequisite F0a: close the client-writable path into extraction
-- evidence before conditional auto-approval is built.
--
-- FINDING (2 Aug 2026). Two policies let an authenticated user rewrite the
-- evidence the trust layer produced:
--   1. extractions "Users can update own extractions" — no column restriction,
--      no doc_type restriction. An organiser could:
--      UPDATE extractions SET payload='{...}', field_flags='[]' on their own
--      payment_screenshot row.
--   2. extraction_documents "Users can update own documents" — no column
--      restriction. doc_type lives on THIS table, so a doc_type-only fix on (1)
--      would be defeated by flipping doc_type first.
-- Both close together or neither closes.
--
-- WHAT LEGITIMATELY WRITES extractions FROM THE CLIENT
-- src/pages/BrochureReview.tsx, and only there:
--   approveMutation -> update({ payload, updated_at })  [load-bearing:
--                      commit-extraction re-reads payload from the DB at :125]
--   discardMutation -> update({ status, updated_at })
-- Columns written: payload, status, updated_at. Nothing else, ever.
-- No client code updates extraction_documents at all (insert/select only).
--
-- service_role and postgres hold their own explicit table grants and are
-- untouched by the revokes below. Per guardrail N1 both grant paths (PUBLIC
-- and the direct anon/authenticated grant) are revoked explicitly.

-- ------------------------------------------------------- (a) column privileges
-- RLS cannot restrict columns; GRANT can.
revoke update on public.extractions from public;
revoke update on public.extractions from anon, authenticated;
grant  update (payload, status, updated_at) on public.extractions to authenticated;

revoke update on public.extraction_documents from public;
revoke update on public.extraction_documents from anon, authenticated;

-- ------------------------------------------------------------ (b) doc_type gate
-- Whitelisted to chess_brochure (not blacklisted against payment_screenshot),
-- so bank_statement (Phase 2B) arrives closed by default.
drop policy if exists "Users can update own extractions" on public.extractions;
create policy "Users can update own extractions"
  on public.extractions for update to authenticated
  using (
    document_id in (
      select d.id from public.extraction_documents d
      where d.uploaded_by = auth.uid()
        and d.doc_type = 'chess_brochure'::public.doc_type
    )
  )
  with check (
    document_id in (
      select d.id from public.extraction_documents d
      where d.uploaded_by = auth.uid()
        and d.doc_type = 'chess_brochure'::public.doc_type
    )
  );

-- ------------------------------- (c) drop the unused documents UPDATE policy
drop policy if exists "Users can update own documents" on public.extraction_documents;

notify pgrst, 'reload schema';
