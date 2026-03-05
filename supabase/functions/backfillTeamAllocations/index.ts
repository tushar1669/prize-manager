/**
 * backfillTeamAllocations — Phase 2 Edge Function
 *
 * Purpose: Backfill missing team_allocations snapshots for published tournaments.
 * This eliminates the need for publicTeamPrizes to fall back to live recomputation.
 *
 * When to run:
 *   - After Phase 1 deployment (publicTeamPrizes pins to publications.version)
 *   - For any published tournament where team_allocations rows are missing for the active version
 *
 * Safety:
 *   - Master or tournament owner only
 *   - Idempotent: if rows already exist for (tournament_id, version), returns early
 *   - Pins to publications.version by default (does not backfill unpublished tournaments)
 *   - Uses the same shared team scoring logic as allocateInstitutionPrizes
 *
 * Example curl:
 *   curl -X POST \
 *     'https://nvjjifnzwrueutbirpde.supabase.co/functions/v1/backfillTeamAllocations' \
 *     -H 'Authorization: Bearer <USER_JWT>' \
 *     -H 'Content-Type: application/json' \
 *     -d '{"tournament_id": "0d54de9f-242a-41bd-a2ad-a70f712c3fd7"}'
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, hasPingQueryParam, isPingBody, pingResponse } from "../_shared/health.ts";
import {
  computeTeamScores,
  type TeamPrizePlayer,
} from "../_shared/teamPrizes.ts";

const BUILD_VERSION = "2026-03-05T15:30:00Z";
const FUNCTION_NAME = "backfillTeamAllocations";
const corsHeaders = CORS_HEADERS;

interface BackfillRequest {
  tournament_id: string;
  version?: number;
}

interface BackfillResponse {
  tournament_id: string;
  version: number;
  groups_processed: number;
  rows_inserted: number;
  already_backfilled: boolean;
  has_team_prizes: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (hasPingQueryParam(req)) {
    return pingResponse(FUNCTION_NAME, BUILD_VERSION);
  }

  const rawBody = await req.text();
  if (isPingBody(rawBody)) {
    return pingResponse(FUNCTION_NAME, BUILD_VERSION);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- Auth ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    if (!token) {
      return jsonResp({ error: "Unauthorized" }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResp({ error: "Unauthorized" }, 401);
    }

    // --- Parse body ---
    const body: BackfillRequest = JSON.parse(rawBody);
    const { tournament_id } = body;
    if (!tournament_id) {
      return jsonResp({ error: "tournament_id is required" }, 400);
    }

    // --- Tournament access check ---
    const { data: tournament, error: tErr } = await supabase
      .from("tournaments")
      .select("id, owner_id")
      .eq("id", tournament_id)
      .maybeSingle();

    if (tErr) throw new Error(`Tournament lookup failed: ${tErr.message}`);
    if (!tournament) return jsonResp({ error: "Tournament not found" }, 404);

    const { data: isMaster } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "master",
    });

    if (tournament.owner_id !== user.id && !isMaster) {
      return jsonResp({ error: "Forbidden" }, 403);
    }

    // --- Resolve version ---
    let pinnedVersion: number;

    if (body.version != null) {
      pinnedVersion = body.version;
    } else {
      const { data: pub, error: pubErr } = await supabase
        .from("publications")
        .select("version")
        .eq("tournament_id", tournament_id)
        .eq("is_active", true)
        .maybeSingle();

      if (pubErr) throw new Error(`Publication lookup failed: ${pubErr.message}`);
      if (!pub) {
        return jsonResp(
          { error: "No active publication found. Cannot backfill unpublished tournament." },
          400
        );
      }
      pinnedVersion = pub.version;
    }

    console.log(`[${FUNCTION_NAME}] tournament=${tournament_id} version=${pinnedVersion}`);

    // --- Check if already backfilled ---
    const { count: existingCount, error: countErr } = await supabase
      .from("team_allocations")
      .select("*", { count: "exact", head: true })
      .eq("tournament_id", tournament_id)
      .eq("version", pinnedVersion);

    if (countErr) throw new Error(`Count check failed: ${countErr.message}`);

    if (existingCount && existingCount > 0) {
      console.log(`[${FUNCTION_NAME}] Already backfilled: ${existingCount} rows`);
      return jsonResp({
        tournament_id,
        version: pinnedVersion,
        groups_processed: 0,
        rows_inserted: 0,
        already_backfilled: true,
        has_team_prizes: true,
      } satisfies BackfillResponse);
    }

    // --- Load groups ---
    const { data: groups, error: gErr } = await supabase
      .from("institution_prize_groups")
      .select("*")
      .eq("tournament_id", tournament_id)
      .eq("is_active", true)
      .order("name");

    if (gErr) throw new Error(`Groups load failed: ${gErr.message}`);

    if (!groups || groups.length === 0) {
      return jsonResp({
        tournament_id,
        version: pinnedVersion,
        groups_processed: 0,
        rows_inserted: 0,
        already_backfilled: false,
        has_team_prizes: false,
      } satisfies BackfillResponse);
    }

    // --- Load prizes for all groups ---
    const groupIds = groups.map((g: { id: string }) => g.id);
    const { data: allPrizes, error: pErr } = await supabase
      .from("institution_prizes")
      .select("*")
      .in("group_id", groupIds)
      .eq("is_active", true)
      .order("place");

    if (pErr) throw new Error(`Prizes load failed: ${pErr.message}`);

    if (!allPrizes || allPrizes.length === 0) {
      return jsonResp({
        tournament_id,
        version: pinnedVersion,
        groups_processed: groups.length,
        rows_inserted: 0,
        already_backfilled: false,
        has_team_prizes: false,
      } satisfies BackfillResponse);
    }

    // --- Load players ---
    const { data: players, error: plErr } = await supabase
      .from("players")
      .select("id, name, rank, gender, club, team, points, tournament_id")
      .eq("tournament_id", tournament_id)
      .order("rank");

    if (plErr) throw new Error(`Players load failed: ${plErr.message}`);

    const typedPlayers = (players || []) as Array<{
      id: string; name: string; rank: number; gender: string | null;
      club: string | null; team: string | null; points: number | null;
    }>;

    // --- Column mapping (same as allocateInstitutionPrizes) ---
    const GROUP_BY_COLUMN_MAP: Record<string, "team" | "club"> = {
      team: "team",
      club: "club",
    };

    // --- Compute and collect insert rows ---
    const insertRows: Array<{
      tournament_id: string;
      version: number;
      group_id: string;
      prize_id: string;
      place: number;
      institution_key: string;
      total_points: number;
      player_ids: string[];
      player_snapshot: Array<{ player_id: string; name: string; rank: number; points: number; gender: string | null }>;
    }> = [];

    for (const group of groups) {
      const columnName = GROUP_BY_COLUMN_MAP[group.group_by];
      if (!columnName) {
        console.warn(`[${FUNCTION_NAME}] Unknown group_by: ${group.group_by}, skipping`);
        continue;
      }

      const groupPrizes = (allPrizes as Array<{ id: string; group_id: string; place: number }>)
        .filter((p) => p.group_id === group.id);

      if (groupPrizes.length === 0) continue;

      const teamPlayers: TeamPrizePlayer[] = typedPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        rank: p.rank,
        points: Number(p.points ?? 0),
        gender: p.gender,
        team: p.team,
        club: p.club,
      }));

      const scored = computeTeamScores(teamPlayers, group.team_size, columnName);

      for (const prize of groupPrizes) {
        const placeIndex = prize.place - 1;
        const winner = scored[placeIndex];
        if (!winner) continue;

        insertRows.push({
          tournament_id,
          version: pinnedVersion,
          group_id: group.id,
          prize_id: prize.id,
          place: prize.place,
          institution_key: winner.key,
          total_points: winner.total_points,
          player_ids: winner.team.map((p) => p.id),
          player_snapshot: winner.team.map((p) => ({
            player_id: p.id,
            name: p.name,
            rank: p.rank,
            points: p.points,
            gender: p.gender,
          })),
        });
      }
    }

    if (insertRows.length === 0) {
      return jsonResp({
        tournament_id,
        version: pinnedVersion,
        groups_processed: groups.length,
        rows_inserted: 0,
        already_backfilled: false,
        has_team_prizes: false,
      } satisfies BackfillResponse);
    }

    // --- Delete any partial rows for this version (idempotent) ---
    await supabase
      .from("team_allocations")
      .delete()
      .eq("tournament_id", tournament_id)
      .eq("version", pinnedVersion);

    // --- Insert ---
    const { error: insertErr } = await supabase
      .from("team_allocations")
      .insert(insertRows);

    if (insertErr) {
      throw new Error(`Insert failed: ${insertErr.message}`);
    }

    console.log(`[${FUNCTION_NAME}] Inserted ${insertRows.length} rows for version ${pinnedVersion}`);

    return jsonResp({
      tournament_id,
      version: pinnedVersion,
      groups_processed: groups.length,
      rows_inserted: insertRows.length,
      already_backfilled: false,
      has_team_prizes: true,
    } satisfies BackfillResponse);
  } catch (error) {
    console.error(`[${FUNCTION_NAME}] Error:`, error);
    return jsonResp(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
