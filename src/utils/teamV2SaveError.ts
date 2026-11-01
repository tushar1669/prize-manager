/**
 * Team V2 Save refusal → plain sentence for the Master.
 *
 * supabase.functions.invoke leaves `data` empty on a non-2xx reply; the
 * server's code is in the error's Response body. Reading it there is what
 * turns "server_unavailable" into the real reason.
 */
export async function readTeamV2SaveCode(error: unknown, data: unknown): Promise<string> {
  const fromBody = (body: unknown) =>
    body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error : null;
  const direct = fromBody(data);
  if (direct) return direct;
  const context = error && typeof error === 'object' ? (error as { context?: unknown }).context : undefined;
  if (context instanceof Response) {
    try {
      const code = fromBody(await context.clone().json());
      if (code) return code;
    } catch {
      /* not JSON */
    }
  }
  return 'server_unavailable';
}

const MESSAGES: Record<string, string> = {
  team_v2_previous_winner_changed:
    'A team prize would go to a different team than in the last saved version (usually because the ranking ' +
    'steps were changed after saving). A saved prize is never changed silently: keep the earlier steps, or ' +
    'record an official arbiter ruling.',
  stale_version: 'Someone saved a newer version meanwhile. Reload the page and review again.',
  source_changed: 'Players or prizes changed while saving. Review again and save.',
  team_v2_source_changed: 'Players or prizes changed while saving. Review again and save.',
  published_regulations_required: 'Confirm the ranking rules (with the published reference) in Edit Rules first.',
  unresolved_team_awards: 'A team prize place is tied or held. It needs an official ruling before saving.',
  ranking_contract_mismatch: 'The saved ranking rules no longer match the preview. Reload and review again.',
  incomplete_individual_awards: 'Individual prizes are incomplete. Run Review & Allocate first.',
};

export function teamV2SaveMessage(code: string): string {
  return MESSAGES[code] ?? code;
}
