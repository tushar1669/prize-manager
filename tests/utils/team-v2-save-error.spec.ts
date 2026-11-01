import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readTeamV2SaveCode, teamV2SaveMessage } from '@/utils/teamV2SaveError';

const httpError = (body: unknown) => Object.assign(new Error('Edge Function returned a non-2xx status code'), {
  context: new Response(JSON.stringify(body), { status: 409 }),
});

describe('Team V2 Save shows the real refusal reason', () => {
  it('reads the code from the 409 body (data is empty on non-2xx)', async () => {
    expect(await readTeamV2SaveCode(httpError({ error: 'team_v2_previous_winner_changed', saved: false }), null))
      .toBe('team_v2_previous_winner_changed');
    expect(await readTeamV2SaveCode(null, { error: 'stale_version' })).toBe('stale_version');
    expect(await readTeamV2SaveCode(new Error('network'), null)).toBe('server_unavailable');
  });
  it('explains a changed saved winner in plain words', () => {
    expect(teamV2SaveMessage('team_v2_previous_winner_changed')).toMatch(/different team than in the last saved version/);
    expect(teamV2SaveMessage('something_new')).toBe('something_new');
  });
  it('saveTeamV2 passes through only the writer\'s fixed team_v2_* code', () => {
    const source = readFileSync('supabase/functions/saveTeamV2/index.ts', 'utf8');
    expect(source).toContain("/\\bteam_v2_[a-z_]+\\b/.exec(commitError?.message ?? '')");
    expect(source).not.toMatch(/json\(\{[^}]*commitError\.message/);
  });
});
