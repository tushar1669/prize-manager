import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260712120000_add_parser_v2_runtime_rollout.sql", "utf8");
const edge = readFileSync("supabase/functions/parseBrochurePrizesV2/index.ts", "utf8");
const tournamentSetup = readFileSync("src/pages/TournamentSetup.tsx", "utf8");
const hook = readFileSync("src/hooks/useBrochureParserV2Rollout.ts", "utf8");
const adminControl = readFileSync("src/components/admin/ParserV2RolloutControl.tsx", "utf8");
const responseAdapter = readFileSync("src/utils/parserV2Response.ts", "utf8");
const featureFlags = readFileSync("src/utils/featureFlags.ts", "utf8");
const viteEnv = readFileSync("src/vite-env.d.ts", "utf8");

describe("Parser V2 runtime rollout migration", () => {
  it("creates one table, safe seed, RLS, RPCs, grants, and audit", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.platform_feature_flags");
    expect(migration).toContain("key text PRIMARY KEY");
    expect(migration).toContain("enabled boolean NOT NULL DEFAULT false");
    expect(migration).toContain("ON CONFLICT (key) DO NOTHING");
    expect(migration).toContain("ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE public.platform_feature_flags FROM anon");
    expect(migration).toContain("REVOKE INSERT, UPDATE, DELETE ON TABLE public.platform_feature_flags FROM authenticated");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_brochure_parser_v2_rollout_state()");
    expect(migration).toContain("RETURNS TABLE(enabled boolean)");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.set_brochure_parser_v2_rollout_state(p_enabled boolean)");
    expect(migration).toContain("IF NOT public.is_master() THEN");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("parser_v2_rollout_update");
    expect(migration).toContain("old_enabled");
    expect(migration).toContain("new_enabled");
  });

  it("does not modify auth role primitives", () => {
    expect(migration).not.toMatch(/CREATE\s+TYPE\s+.*app_role/i);
    expect(migration).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(has_role|is_master)\b/i);
    expect(migration).not.toMatch(/user_roles\s+(ADD|DROP|ALTER|UPDATE|INSERT|DELETE)/i);
  });
});

describe("Parser V2 edge gate", () => {
  it("enforces env and DB gates before authorization/provider/brochure work", () => {
    const gateIndex = edge.indexOf('stage = "feature_gate"');
    expect(gateIndex).toBeGreaterThan(0);
    expect(edge.indexOf('stage = "tournament_lookup"')).toBeGreaterThan(gateIndex);
    expect(edge.indexOf('stage = "allowlist"')).toBeGreaterThan(gateIndex);
    expect(edge.indexOf('stage = "provider_request_build"')).toBeGreaterThan(gateIndex);
    expect(edge.indexOf('stage = "brochure_lookup"')).toBeGreaterThan(gateIndex);
    expect(edge.indexOf('stage = "storage_download"')).toBeGreaterThan(gateIndex);
    expect(edge).toContain('if (!flagEnabled()) return parserV2DisabledResponse(jobId)');
    expect(edge).toContain('if (!(await runtimeRolloutEnabled(supabase, jobId))) return parserV2DisabledResponse(jobId)');
  });

  it("uses a generic disabled response and fails closed on DB miss/error", () => {
    expect(edge).toContain('status: "not_enabled", code: "parser_v2_disabled"');
    expect(edge).toContain('"feature_gate"');
    expect(edge).toContain('.select("enabled")');
    expect(edge).toContain('.eq("key", "brochure_parser_v2")');
    expect(edge).toContain('return data?.enabled === true');
    expect(edge).toMatch(/catch \(_\)[\s\S]*return false/);
  });
});

describe("Parser V2 frontend rollout", () => {
  it("uses the RPC hook and fails closed", () => {
    expect(hook).toContain('get_brochure_parser_v2_rollout_state');
    expect(hook).toContain('BROCHURE_PARSER_V2_ROLLOUT_QUERY_KEY');
    expect(hook).toContain('enabled: query.data === true && !query.isLoading && !query.isError');
    expect(hook).toContain('staleTime: 45_000');
  });

  it("wires TournamentSetup and admin control without the old Vite flag", () => {
    expect(tournamentSetup).toContain('useBrochureParserV2Rollout');
    expect(tournamentSetup).toContain('parserV2Rollout.enabled && (');
    expect(adminControl).toContain('AI Parser V2 (Beta)');
    expect(adminControl).toContain('set_brochure_parser_v2_rollout_state');
    expect(adminControl).toContain('AI Parser V2 enabled.');
    expect(adminControl).toContain('Could not update AI Parser V2. No change was made.');
    expect(featureFlags).not.toContain('VITE_BROCHURE_PARSER_V2_ENABLED');
    expect(viteEnv).not.toContain('VITE_BROCHURE_PARSER_V2_ENABLED');
  });

  it("maps parser_v2_disabled safely", () => {
    expect(responseAdapter).toContain('parser_v2_disabled');
    expect(responseAdapter).toContain('AI Parser V2 is currently disabled. Use the existing parser or manual setup.');
  });
});
