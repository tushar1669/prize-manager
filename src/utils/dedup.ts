import type { SupabaseClient } from "@supabase/supabase-js";
import { IMPORT_MERGE_POLICY_DEFAULTS } from "@/utils/featureFlags";

export type MergePolicy = typeof IMPORT_MERGE_POLICY_DEFAULTS;

export type DedupAction = "create" | "update" | "skip";

export interface DedupIncomingPlayer {
  _originalIndex: number;
  name: string;
  dob?: string | null;
  dob_raw?: string | null;
  rating?: number | null;
  fide_id?: string | null;
  city?: string | null;
  state?: string | null;
  club?: string | null;
  gender?: string | null;
  disability?: string | null;
  special_notes?: string | null;
  federation?: string | null;
  [key: string]: unknown;
}

export interface DedupExistingPlayer {
  id: string;
  name: string;
  dob?: string | null;
  rating?: number | null;
  fide_id?: string | null;
  city?: string | null;
  state?: string | null;
  club?: string | null;
  gender?: string | null;
  disability?: string | null;
  special_notes?: string | null;
  federation?: string | null;
}

export interface MergeResult {
  changes: Record<string, unknown>;
  changedFields: string[];
}

export interface DedupMatch {
  existing: DedupExistingPlayer;
  score: number;
  reason: string;
  merge: MergeResult;
}

export interface DedupCandidate {
  row: number;
  incoming: DedupIncomingPlayer;
  matches: DedupMatch[];
  bestMatch?: DedupMatch;
  defaultAction: DedupAction;
}

export interface DedupDecision {
  row: number;
  action: DedupAction;
  existingId?: string;
  payload?: Record<string, unknown>;
}

export interface DedupSummary {
  totalCandidates: number;
  matchedCandidates: number;
  defaultCreates: number;
  defaultUpdates: number;
  defaultSkips: number;
  scoreThreshold: number;
}

export interface DedupPassResult {
  candidates: DedupCandidate[];
  decisions: DedupDecision[];
  summary: DedupSummary;
}

interface RpcCandidateMatch {
  row: number;
  matches: DedupExistingPlayer[];
}

const DEDUP_LOOKUP_RPC = "import_dedup_candidates";
const SCORE_THRESHOLD = 0.45;

const mergeableFields: (keyof DedupIncomingPlayer)[] = [
  "rating",
  "dob",
  "dob_raw",
  "gender",
  "state",
  "city",
  "club",
  "disability",
  "special_notes",
  "federation",
];

export function normalizeCandidateName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreCandidate(incoming: DedupIncomingPlayer, existing: DedupExistingPlayer): number {
  let score = 0;

  if (!incoming?.name || !existing?.name) return 0;

  const incomingName = normalizeCandidateName(incoming.name);
  const existingName = normalizeCandidateName(existing.name);

  if (incomingName && incomingName === existingName) {
    score += 0.45;
  }

  if (incoming.fide_id && existing.fide_id && incoming.fide_id === existing.fide_id) {
    score += 0.4;
  }

  if (incoming.dob && existing.dob) {
    if (incoming.dob === existing.dob) {
      score += 0.25;
    } else if (incoming.dob_raw && existing.dob && incoming.dob_raw.startsWith(existing.dob.slice(0, 4))) {
      score += 0.1;
    }
  }

  if (incoming.rating != null && existing.rating != null) {
    const diff = Math.abs(Number(incoming.rating) - Number(existing.rating));
    if (diff <= 25) {
      score += 0.1;
    } else if (diff <= 50) {
      score += 0.05;
    }
  }

  return Math.min(1, score);
}

export function applyMergePolicy(
  incoming: DedupIncomingPlayer,
  existing: DedupExistingPlayer,
  policy: MergePolicy,
): MergeResult {
  const changes: Record<string, unknown> = {};
  const changedFields: string[] = [];

  mergeableFields.forEach(field => {
    const incomingValue = incoming[field];
    const existingValue = existing[field as keyof DedupExistingPlayer];

    if (incomingValue == null || incomingValue === "") {
      return;
    }

    if (field === "dob" || field === "dob_raw") {
      const existingDob = existing.dob;
      if (field === "dob" && policy.neverOverwriteDob && existingDob) {
        return;
      }
      if (existingDob !== incomingValue) {
        changes.dob = incoming.dob ?? null;
        if (incoming.dob_raw) {
          changes.dob_raw = incoming.dob_raw;
        }
        changedFields.push("dob");
      }
      return;
    }

    if (field === "rating") {
      const incomingRating = typeof incomingValue === "number" ? incomingValue : Number(incomingValue);
      const existingRating = existing.rating != null ? Number(existing.rating) : null;

      if (existingRating == null) {
        changes.rating = incomingRating;
        changedFields.push("rating");
        return;
      }

      if (policy.preferNewerRating && incomingRating > existingRating) {
        changes.rating = incomingRating;
        changedFields.push("rating");
      }
      return;
    }

    const existingIsBlank = existingValue == null || existingValue === "";

    if (existingIsBlank) {
      changes[field] = incomingValue;
      changedFields.push(field as string);
      return;
    }

    if (!policy.fillBlanks && incomingValue !== existingValue) {
      changes[field] = incomingValue;
      changedFields.push(field as string);
    }
  });

  return {
    changes,
    changedFields,
  };
}

export async function fetchDedupCandidates(
  client: SupabaseClient,
  tournamentId: string,
  players: DedupIncomingPlayer[],
): Promise<RpcCandidateMatch[]> {
  if (!players.length) return [];

  const payload = players.map(player => ({
    row: player._originalIndex,
    name: player.name,
    dob: player.dob ?? null,
    fide_id: player.fide_id ?? null,
  }));

  try {
    const { data, error } = await client.rpc(DEDUP_LOOKUP_RPC, {
      tournament_id: tournamentId,
      candidates: payload,
    });

    if (error) {
      console.warn("[dedup] RPC lookup failed", error);
      return [];
    }

    if (!Array.isArray(data)) {
      console.warn("[dedup] RPC returned unexpected payload", data);
      return [];
    }

    const grouped = new Map<number, DedupExistingPlayer[]>();

    data.forEach((entry: any) => {
      const candidateRow = Number(entry?.cand_idx ?? entry?.row);
      const playerId = entry?.player_id;

      if (!Number.isFinite(candidateRow) || !playerId) {
        return;
      }

      const matches = grouped.get(candidateRow) ?? [];

      matches.push({
        id: playerId,
        name: entry?.name ?? "",
        dob: entry?.dob ?? null,
        rating: entry?.rating ?? null,
        fide_id: entry?.fide_id ?? null,
        city: entry?.city ?? null,
        state: entry?.state ?? null,
        club: entry?.club ?? null,
        gender: entry?.gender ?? null,
        disability: entry?.disability ?? null,
        special_notes: entry?.special_notes ?? null,
        federation: entry?.federation ?? null,
      });

      grouped.set(candidateRow, matches);
    });

    console.log(`[dedup] RPC matched ${grouped.size} candidates`);

    return Array.from(grouped.entries()).map(([row, matches]) => ({
      row,
      matches,
    }));
  } catch (err) {
    console.warn("[dedup] RPC call threw", err);
    return [];
  }
}

export async function runDedupPass({
  client,
  tournamentId,
  incomingPlayers,
  existingPlayers = [],
  mergePolicy = IMPORT_MERGE_POLICY_DEFAULTS,
}: {
  client: SupabaseClient;
  tournamentId: string;
  incomingPlayers: DedupIncomingPlayer[];
  existingPlayers?: DedupExistingPlayer[];
  mergePolicy?: MergePolicy;
}): Promise<DedupPassResult> {
  console.log(`[dedup] start pass count=${incomingPlayers.length}`);

  const rpcMatches = await fetchDedupCandidates(client, tournamentId, incomingPlayers);

  const fallbackMatches: RpcCandidateMatch[] = [];

  if (rpcMatches.length === 0 && existingPlayers.length > 0) {
    console.log("[dedup] using local fallback matching");
    incomingPlayers.forEach(player => {
      const matches = existingPlayers.filter(existing => {
        if (player.fide_id && existing.fide_id) {
          return player.fide_id === existing.fide_id;
        }

        if (player.name && existing.name && player.dob && existing.dob) {
          return (
            normalizeCandidateName(player.name) === normalizeCandidateName(existing.name) &&
            player.dob === existing.dob
          );
        }

        return false;
      });

      if (matches.length > 0) {
        fallbackMatches.push({ row: player._originalIndex, matches });
      }
    });
  }

  const combinedMatches = rpcMatches.length > 0 ? rpcMatches : fallbackMatches;

  const candidates: DedupCandidate[] = [];
  const decisions: DedupDecision[] = [];

  incomingPlayers.forEach(player => {
    const matchEntry = combinedMatches.find(entry => entry.row === player._originalIndex);
    const matches: DedupMatch[] = [];

    matchEntry?.matches.forEach(existing => {
      const score = scoreCandidate(player, existing);
      if (score > 0) {
        const merge = applyMergePolicy(player, existing, mergePolicy);
        const reason = existing.fide_id && player.fide_id && existing.fide_id === player.fide_id
          ? "Matched on FIDE ID"
          : player.dob && existing.dob && player.dob === existing.dob
            ? "Matched on name + DOB"
            : "Matched on normalized name";

        matches.push({
          existing,
          score,
          reason,
          merge,
        });
      }
    });

    matches.sort((a, b) => b.score - a.score);

    const bestMatch = matches[0];
    let defaultAction: DedupAction = "create";

    if (bestMatch && bestMatch.score >= SCORE_THRESHOLD) {
      if (bestMatch.merge.changedFields.length > 0) {
        defaultAction = "update";
      } else {
        defaultAction = "skip";
      }
    }

    const candidate: DedupCandidate = {
      row: player._originalIndex,
      incoming: player,
      matches,
      bestMatch,
      defaultAction,
    };

    candidates.push(candidate);

    if (defaultAction === "update" && bestMatch) {
      decisions.push({
        row: player._originalIndex,
        action: "update",
        existingId: bestMatch.existing.id,
        payload: bestMatch.merge.changes,
      });
    } else if (defaultAction === "skip" && bestMatch) {
      decisions.push({
        row: player._originalIndex,
        action: "skip",
        existingId: bestMatch.existing.id,
      });
    } else {
      decisions.push({ row: player._originalIndex, action: "create" });
    }
  });

  const summary: DedupSummary = {
    totalCandidates: candidates.length,
    matchedCandidates: candidates.filter(c => c.bestMatch).length,
    defaultCreates: decisions.filter(d => d.action === "create").length,
    defaultUpdates: decisions.filter(d => d.action === "update").length,
    defaultSkips: decisions.filter(d => d.action === "skip").length,
    scoreThreshold: SCORE_THRESHOLD,
  };

  console.log("[dedup] summary", summary);

  return {
    candidates,
    decisions,
    summary,
  };
}
