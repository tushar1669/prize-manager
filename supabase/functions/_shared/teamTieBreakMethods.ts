/**
 * Standard individual tie-break methods an organizer can assign to an
 * imported Swiss-Manager TB column (TB1…TBn) for Team Ranking v2.
 *
 * Shared by the organizer UI (via src/utils/teamTieBreakMethods.ts) and the
 * Edge scorer, so the dropdown and the server can never disagree.
 *
 * Prize Manager receives final standings only — never round-by-round results —
 * so it cannot CALCULATE any of these. A method here only NAMES a column the
 * imported file already contains. A team's value for a summable method is the
 * sum of the counted players' imported values, and every standard FIDE
 * tie-break ranks a higher value first.
 *
 * Direct Encounter compares results between the tied players themselves; a
 * sum of individual DE values means nothing for a team. It may be declared but
 * must never decide a prize automatically (blocked as `undefined_tb`).
 */
export type TeamTieBreakMethod = {
  /** Stable identifier, never shown to users. */
  id: string;
  /** Canonical name stored in the rule as `criterion.name`. */
  name: string;
  /** Text shown in the dropdown. */
  optionLabel: string;
  /** May the team value be the sum of the counted players' values? */
  summable: boolean;
  /** Normalized alternative spellings (see normalizeTieBreakName). */
  aliases: readonly string[];
};

export const TEAM_TIEBREAK_METHODS: readonly TeamTieBreakMethod[] = [
  { id: 'bh_c1', name: 'Buchholz Cut-1', optionLabel: 'Buchholz Cut-1 (BH-C1)', summable: true,
    aliases: ['bhc1', 'bhcut1', 'buchholzc1', 'cut1buchholz'] },
  { id: 'bh', name: 'Buchholz', optionLabel: 'Buchholz (BH)', summable: true,
    aliases: ['bh', 'fullbuchholz', 'buchholztotal'] },
  { id: 'bh_c2', name: 'Buchholz Cut-2', optionLabel: 'Buchholz Cut-2', summable: true,
    aliases: ['bhc2', 'bhcut2', 'buchholzc2', 'cut2buchholz'] },
  { id: 'bh_m1', name: 'Median Buchholz', optionLabel: 'Median Buchholz', summable: true,
    aliases: ['bhm1', 'buchholzmedian', 'medianbuchholz1', 'median'] },
  { id: 'sb', name: 'Sonneborn-Berger', optionLabel: 'Sonneborn-Berger (SB)', summable: true,
    aliases: ['sb', 'sonneborn', 'sonnebornbergerscore', 'neustadtl', 'neustadtlscore'] },
  { id: 'progressive', name: 'Progressive / Cumulative score', optionLabel: 'Progressive / Cumulative score', summable: true,
    aliases: ['progressive', 'progressivescore', 'cumulative', 'cumulativescore', 'ps', 'cum'] },
  { id: 'wins', name: 'Number of wins', optionLabel: 'Number of wins', summable: true,
    aliases: ['wins', 'win', 'won', 'gameswon', 'numberofgameswon'] },
  { id: 'black', name: 'Games played with Black', optionLabel: 'Games played with Black', summable: true,
    aliases: ['bpg', 'gameswithblack', 'blackgames', 'numberofgameswithblack', 'numberofgamesplayedwithblack'] },
  { id: 'aro', name: 'Average Rating of Opponents', optionLabel: 'Average Rating of Opponents (ARO)', summable: true,
    aliases: ['aro', 'averageopponentrating', 'avgratingofopponents', 'averageratingofopponentsaro'] },
  { id: 'tpr', name: 'Performance Rating', optionLabel: 'Performance Rating (TPR)', summable: true,
    aliases: ['tpr', 'tournamentperformancerating', 'performance', 'rp'] },
  { id: 'koya', name: 'Koya score', optionLabel: 'Koya score', summable: true,
    aliases: ['koya', 'koyasystem', 'ks'] },
  { id: 'de', name: 'Direct Encounter', optionLabel: 'Direct Encounter (cannot be summed — never decides money automatically)', summable: false,
    aliases: ['de', 'directencounterde', 'headtohead', 'h2h', 'mutualresult', 'directencounters'] },
];

/** Lower-case and strip everything except letters and digits. */
export function normalizeTieBreakName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Match a stored or typed name to a standard method; null when it is custom. */
export function findTeamTieBreakMethod(name: string | null | undefined): TeamTieBreakMethod | null {
  if (typeof name !== 'string') return null;
  const key = normalizeTieBreakName(name);
  if (!key) return null;
  return TEAM_TIEBREAK_METHODS.find(method =>
    normalizeTieBreakName(method.name) === key ||
    normalizeTieBreakName(method.optionLabel) === key ||
    method.aliases.includes(key),
  ) ?? null;
}

/** Fragments that mark a head-to-head method however the name is written. */
const NON_SUMMABLE_MARKERS = ['directencounter', 'headtohead', 'mutualresult', 'mutualencounter'] as const;

/**
 * True for any name meaning a method whose values cannot be added for a team.
 * Deliberately broader than findTeamTieBreakMethod: a hand-typed variant such
 * as "Direct encounter (DE) between tied teams" must fail closed.
 */
export function isNonSummableTieBreakName(name: string | null | undefined): boolean {
  const method = findTeamTieBreakMethod(name);
  if (method) return !method.summable;
  const key = normalizeTieBreakName(name ?? '');
  return NON_SUMMABLE_MARKERS.some(marker => key.includes(marker));
}
