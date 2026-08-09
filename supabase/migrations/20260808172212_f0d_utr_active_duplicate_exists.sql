-- F0d closeout (D30/D31 parity): one server-side definition of "same UTR",
-- callable by the extract edge function so the advisory duplicate banner
-- compares exactly the way submit_tournament_payment_claim does.
--
-- Read-only. Returns a boolean and nothing else. normalize_utr is NOT touched
-- (frozen by Q2 while uq_tournament_payments_utr_active exists).
create or replace function public.utr_active_duplicate_exists(p_utr text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournament_payments tp
    where tp.status <> 'rejected'
      and public.normalize_utr(tp.utr) = public.normalize_utr(p_utr)
  )
$$;

-- N1: PUBLIC path and role path are independent. Close both, then grant only
-- to service_role (the extract function uses the service-role client).
revoke all on function public.utr_active_duplicate_exists(text) from public;
revoke all on function public.utr_active_duplicate_exists(text) from anon;
revoke all on function public.utr_active_duplicate_exists(text) from authenticated;
grant execute on function public.utr_active_duplicate_exists(text) to service_role;

notify pgrst, 'reload schema';
