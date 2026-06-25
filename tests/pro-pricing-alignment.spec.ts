import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20260625133000_pro_pricing_deployment_repair.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

describe('Cycle M pro pricing deployment repair migration', () => {
  it('adds canonical pricing resolver tiers for 150, 151, 500, and 501 player boundaries', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_tournament_pro_price(tournament_id uuid)');
    expect(sql).toContain('v_players_count <= v_free_player_threshold');
    expect(sql).toContain("amount_inr := 0;");
    expect(sql).toContain("tier_label := 'free_0_to_150'");
    expect(sql).toContain('ELSIF v_players_count <= 500 THEN');
    expect(sql).toContain("amount_inr := 500;");
    expect(sql).toContain("tier_label := 'pro_151_to_500'");
    expect(sql).toContain("amount_inr := 1000;");
    expect(sql).toContain("tier_label := 'pro_501_plus'");
  });

  it('aligns access resolver so zero through 150 players are free and entitlements still unlock', () => {
    expect(sql).toContain('v_free_player_threshold CONSTANT integer := 150;');
    expect(sql).toContain('is_free_small_tournament := (v_players_count <= v_free_player_threshold);');
    expect(sql).toContain('has_full_access := is_free_small_tournament OR v_has_active_entitlement;');
    expect(sql).toContain('preview_main_limit := CASE WHEN has_full_access THEN NULL ELSE 8 END;');
  });

  it('hardens manual UPI amounts against stale frontend pricing and free tournament payments', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.submit_tournament_payment_claim');
    expect(sql).toContain("RAISE EXCEPTION 'TOURNAMENT_ALREADY_FREE'");
    expect(sql).toContain("RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT'");
    expect(sql).toContain("RAISE EXCEPTION 'PENDING_PAYMENT_ALREADY_EXISTS'");
    expect(sql).toContain('cr.amount_after > 0');
    expect(sql).toContain('cr.amount_after < v_canonical_amount');
    expect(sql).toContain('cr.amount_before = v_canonical_amount');
  });

  it('makes coupon RPCs use canonical amount and reject stale amount_before/free tournaments', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.apply_coupon_for_tournament');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.redeem_coupon_for_tournament');
    expect(sql).toContain("'amount_before_mismatch'");
    expect(sql).toContain("'already_free'");
    expect(sql).toContain('v_canonical_amount');
    expect(sql).toContain('INSERT INTO public.coupon_redemptions');
    expect(sql).toContain('INSERT INTO public.tournament_entitlements');
    expect(sql).toContain('IF v_after = 0 THEN');
  });
});
