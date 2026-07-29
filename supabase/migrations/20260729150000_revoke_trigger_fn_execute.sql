-- The enqueue trigger function is SECURITY DEFINER and must only ever run from
-- the AFTER UPDATE trigger on public.tournament_payments, never be callable
-- directly by a client role.
revoke execute on function public.enqueue_payment_notification() from anon, authenticated;
