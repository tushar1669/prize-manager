import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const edge = readFileSync('supabase/functions/saveTeamV2/index.ts', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const page = readFileSync('src/pages/admin/TeamV2Trial.tsx', 'utf8');
const dialog = readFileSync('src/components/allocation/TeamV2RulingDialog.tsx', 'utf8');

describe('Master-only Team V2 test tournament surface (disabled unless DB canary)', () => {
  it('confirms current version through JWT/master/DB canary before Save', () => {
    const master = edge.indexOf('if (master !== true)');
    const canary = edge.indexOf("db.rpc('team_v2_canary_active'");
    const status = edge.indexOf("requestBody.action === 'status'");
    expect(master).toBeGreaterThan(-1);
    expect(canary).toBeGreaterThan(master);
    expect(status).toBeGreaterThan(canary);
    expect(edge).toContain('expected_version: currentVersion');
    expect(edge).toContain('ENABLE_TEAM_V2_ATOMIC_SAVE');
  });
  it('renders exclusively behind the existing master route guard', () => {
    expect(app).toContain('<ProtectedRoute requireMaster><AdminLayout /></ProtectedRoute>');
    expect(app).toContain('path="team-v2/:id"');
    expect(app).toContain('TeamV2Trial');
  });
  it('never uses legacy finalize or browser winner arrays', () => {
    expect(page).toContain("supabase.functions.invoke('saveTeamV2'");
    expect(page).toContain("action: 'status'");
    expect(page).toContain('official_rulings: rulings');
    expect(page).not.toContain("functions.invoke('finalize'");
    expect(page).not.toContain('player_id:');
    expect(page).not.toContain('reason_codes:');
    expect(page).toContain('master');
  });
  it('keeps official decision proposals separate from saved awards', () => {
    expect(dialog).toContain('onReviewed');
    expect(dialog).toContain('next_allocation_version: data.review.proposed_new_version');
    expect(page).toContain('TeamPrizesTabView');
  });
});
