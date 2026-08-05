begin;

-- F0d Migration A (D31): make submit_tournament_payment_claim (5-arg) and
-- review_tournament_payment the only client paths into tournament_payments.
-- Verified 4 Aug 2026: every client access to this table in src/ is .select();
-- both write policies below are unused; the 3-arg and 4-arg overloads have
-- zero callers anywhere in the repo.

-- 1. Drop unused client write policies
drop policy if exists users_insert_own_payments on public.tournament_payments;
drop policy if exists users_update_own_pending_payments on public.tournament_payments;

-- 2. Revoke client write grants. authenticated keeps SELECT (Dashboard banner,
--    payment page, admin tables, martech hooks read via existing policies).
revoke insert, update, delete, truncate, trigger, references
  on table public.tournament_payments from anon, authenticated;
revoke select on table public.tournament_payments from anon;

-- 3. Drop dead claim overloads (both were anon-executable)
drop function public.submit_tournament_payment_claim(uuid, integer, text);
drop function public.submit_tournament_payment_claim(uuid, integer, text, uuid);

-- 4. review_tournament_payment grant hygiene (N1/D18). GRANT-ONLY: the function
--    body is untouched (guardrail 10). Re-grant authenticated because masters
--    invoke this RPC from the browser.
revoke execute on function public.review_tournament_payment(uuid, text, text) from public;
revoke execute on function public.review_tournament_payment(uuid, text, text) from anon;
grant execute on function public.review_tournament_payment(uuid, text, text) to authenticated, service_role;

-- 5. PostgREST schema cache
notify pgrst, 'reload schema';

commit;
