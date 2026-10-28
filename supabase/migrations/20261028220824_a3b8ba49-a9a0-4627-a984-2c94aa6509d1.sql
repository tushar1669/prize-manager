-- Stage 4: document backend-only intent. No anon/authenticated grants exist or are added.
-- Rollback: DROP POLICY "service_role only" ON each of the four tables.
CREATE POLICY "service_role only" ON public.platform_feature_flags FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role only" ON public.tournament_player_watermark FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role only" ON public.payment_invariant_verdicts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role only" ON public.payment_auto_approval_audit FOR ALL TO service_role USING (true) WITH CHECK (true);