import type { DedupCandidate, DedupDecision, DedupAction } from './dedup';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface GroupedCandidates {
  high: DedupCandidate[];
  medium: DedupCandidate[];
  low: DedupCandidate[];
}

/**
 * Determine confidence level based on match score
 * - High: >= 0.7 (strong match)
 * - Medium: 0.5-0.69 (moderate match)
 * - Low: 0.45-0.49 (weak match, near threshold)
 */
export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.7) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

/**
 * Group candidates by confidence level based on their best match score
 */
export function groupByConfidence(candidates: DedupCandidate[]): GroupedCandidates {
  const grouped: GroupedCandidates = {
    high: [],
    medium: [],
    low: [],
  };

  for (const candidate of candidates) {
    // Only group candidates that have matches
    if (candidate.bestMatch) {
      const level = getConfidenceLevel(candidate.bestMatch.score);
      grouped[level].push(candidate);
    }
  }

  return grouped;
}

/**
 * Get progress counts: how many candidates have been resolved vs total
 * A candidate is "resolved" if it has a decision that differs from "create"
 * (i.e., organizer has made a choice: update, skip, or explicitly chose create)
 */
export function getProgressCounts(
  candidates: DedupCandidate[],
  decisions: Record<number, DedupAction>
): { resolved: number; total: number } {
  // Only count candidates with matches as needing resolution
  const candidatesWithMatches = candidates.filter(c => c.bestMatch);
  const total = candidatesWithMatches.length;
  
  // Count how many have explicit decisions (not just default)
  const resolved = candidatesWithMatches.filter(c => {
    const decision = decisions[c.row];
    // Consider resolved if there's any decision recorded
    return decision !== undefined;
  }).length;

  return { resolved, total };
}

/**
 * Get summary counts of actions: create, update, skip
 */
export function getActionCounts(decisions: Record<number, DedupAction>): {
  create: number;
  update: number;
  skip: number;
} {
  const counts = { create: 0, update: 0, skip: 0 };
  
  for (const action of Object.values(decisions)) {
    counts[action]++;
  }
  
  return counts;
}

/**
 * Convert decisions record to array format expected by backend
 */
export function decisionsToArray(
  decisions: Record<number, DedupAction>,
  candidates: DedupCandidate[]
): DedupDecision[] {
  return candidates.map(candidate => {
    const action = decisions[candidate.row] ?? candidate.defaultAction;
    const decision: DedupDecision = {
      row: candidate.row,
      action,
    };

    if (action === 'update' && candidate.bestMatch) {
      decision.existingId = candidate.bestMatch.existing.id;
      decision.payload = candidate.bestMatch.merge.changes;
    } else if (action === 'skip' && candidate.bestMatch) {
      decision.existingId = candidate.bestMatch.existing.id;
    }

    return decision;
  });
}
