/** Pure HTML renderer for the existing generatePdf printable data URI.
 * Receives already-authorized, version-selected records. No DB I/O or scoring.
 */
// Team prize types matching allocateInstitutionPrizes response
interface TeamPlayerInfo {
  player_id: string;
  name: string;
  rank: number;
  points: number;
  gender: string | null;
}

interface WinnerInstitution {
  key: string;
  label: string;
  total_points: number;
  rank_sum: number;
  best_individual_rank: number;
  players: TeamPlayerInfo[];
  applied_rule_label?: string | null;
}

interface GroupConfig {
  group_by: string;
  team_size: number;
  female_slots: number;
  male_slots: number;
  scoring_mode: string;
}

interface PrizeWithWinner {
  id: string;
  place: number;
  cash_amount: number;
  has_trophy: boolean;
  has_medal: boolean;
  is_active: boolean;
  winner_institution: WinnerInstitution | null;
}

interface GroupResponse {
  group_id: string;
  name: string;
  config: GroupConfig;
  prizes: PrizeWithWinner[];
  eligible_institutions: number;
  ineligible_institutions: number;
  ineligible_reasons: string[];
  /**
   * Optional: shipped by allocateInstitutionPrizes (TC1.5), absent from the persisted
   * snapshot until TC1.6. When absent the Points column behaves exactly as before.
   */
  players_without_points?: number;
  /** Historical awards count; eligibility cannot be recovered from winners alone. */
  snapshot_award_count?: number;
}

export interface TeamPrizeResults {
  groups: GroupResponse[];
  players_loaded: number;
  max_rank: number;
}


const GROUP_BY_LABELS: Record<string, string> = {
  // TC1.6: names the FIELD grouped on, never a claim about the prize itself —
  // the group's own name (e.g. "Best State") already says what it's for.
  club: 'Club / institution field',
  city: 'City',
  state: 'State',
  group_label: 'Swiss Group (Gr)',
  type_label: 'Swiss Type',
};

/**
 * RULING 2 (PRD §3), binding: printed output states the RULE THAT WAS APPLIED and
 * never asserts a count of players' attributes. The PDF previously printed
 * "(2F + 2M required)", which claimed to know what four people on a roster are.
 *
 * RULING 1: `male_slots` means "not F" — satisfied by a player whose sex was never
 * recorded — so it prints as "other players", never "boys" or "male".
 *
 * A deliberate PARALLEL of `formatTeamRuleClause` in
 * `src/components/allocation/TeamPrizeResultsPanel.tsx`. The two run in different
 * runtimes (Deno edge function vs. browser bundle) with no module they can share,
 * so the duplication is the cost of the boundary — same pattern as the exclusion
 * sentences in allocateInstitutionPrizes. Keep the wording in step.
 *
 * Returns null when both minimums are zero: no rule was applied, so nothing prints.
 */
function formatTeamRuleClause(config: { female_slots: number; male_slots: number }): string | null {
  const female = Math.max(0, Math.trunc(Number(config?.female_slots) || 0));
  const male = Math.max(0, Math.trunc(Number(config?.male_slots) || 0));
  if (female === 0 && male === 0) return null;

  const parts: string[] = [];
  if (female > 0) parts.push(`at least ${female} girl${female === 1 ? '' : 's'}`);
  if (male > 0) {
    const lead = parts.length === 0 ? 'at least ' : '';
    parts.push(`${lead}${male} other player${male === 1 ? '' : 's'}`);
  }
  return parts.join(', ');
}

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function getPlaceOrdinal(place: number): string {
  if (place === 1) return '1st';
  if (place === 2) return '2nd';
  if (place === 3) return '3rd';
  return `${place}th`;
}


// Tournament type for generating HTML report
type TournamentInfo = {
  title: string;
  start_date: string;
  end_date: string;
  venue?: string | null;
};

// Allocation row type for HTML report
type AllocationRow = {
  players?: { rank?: number | null; name?: string | null } | null;
  prizes?: {
    categories?: { name?: string | null } | null;
    place?: number | null;
    cash_amount?: number | null;
    has_trophy?: boolean | null;
    has_medal?: boolean | null;
  } | null;
};

export function generateHtmlReport(
  tournament: TournamentInfo,
  allocations: AllocationRow[],
  version: number,
  teamPrizes: TeamPrizeResults | null,
  teamPrizeError: string | null
): string {
  // Generate team prizes section HTML
  let teamPrizesHtml = '';
  
  if (teamPrizeError) {
    teamPrizesHtml = `
      <section class="pm-team-report">
      <h2>Team / Institution Prizes</h2>
      <p class="meta" style="color: #c53030;">
        Team prizes could not be included due to an error: ${escapeHtml(teamPrizeError)}<br>
        Please check the online Team Prizes view.
      </p>
      </section>
    `;
  } else if (teamPrizes && teamPrizes.groups.length > 0) {
    teamPrizesHtml = `
      <section class="pm-team-report">
      <h2>Team / Institution Prizes</h2>
      <p class="meta pm-team-intro">Team prizes are allocated separately from individual prizes. Players may win both individual and team prizes.</p>
      ${teamPrizes.groups.map((group, groupIndex) => {
        const filledPrizes = group.prizes.filter(p => p.winner_institution !== null);
        const groupByLabel = GROUP_BY_LABELS[group.config.group_by] || group.config.group_by;

        const ruleClause = formatTeamRuleClause(group.config);
        const genderReq = ruleClause ? ` (rule applied: ${ruleClause})` : '';

        // Every scored institution contributes exactly team_size players, so this is
        // the pool allocateInstitutionPrizes counted `players_without_points` over.
        // Equal means not one counted player had a points value, and every total in
        // the table below is a 0 that means "absent" rather than "scored nothing".
        const selectedPoolSize = group.eligible_institutions * group.config.team_size;
        const pointsAbsent =
          typeof group.players_without_points === 'number' &&
          selectedPoolSize > 0 &&
          group.players_without_points === selectedPoolSize;

        return `
          <section class="pm-team-group" data-team-tone="${['gold', 'teal', 'navy'][groupIndex % 3]}">
          <header class="pm-team-group-header">
          <h3>${escapeHtml(group.name)}</h3>
          <p class="meta pm-team-meta">
            ${escapeHtml(groupByLabel)} • Teams of ${group.config.team_size}${escapeHtml(genderReq)}
            • ${typeof group.snapshot_award_count === 'number'
              ? `${group.snapshot_award_count} recorded team award${group.snapshot_award_count !== 1 ? 's' : ''}`
              : `${group.eligible_institutions} eligible institution${group.eligible_institutions !== 1 ? 's' : ''}`}
          </p>
          </header>
          ${filledPrizes.length > 0 ? `
            <table class="pm-team-table">
              <thead>
                <tr>
                  <th>Place</th>
                  <th>Institution</th>
                  <th>Points</th>
                  <th>Prize</th>
                </tr>
              </thead>
              <tbody>
                ${filledPrizes.map(prize => {
                  const winner = prize.winner_institution!;
                  const prizeText = [
                    prize.cash_amount > 0 ? `₹${prize.cash_amount}` : '',
                    prize.has_trophy ? '🏆' : '',
                    prize.has_medal ? '🥇' : '',
                  ].filter(Boolean).join(' ') || '—';

                  return `
                    <tr>
                      <td>${getPlaceOrdinal(prize.place)}</td>
                      <td>
                        <strong>${escapeHtml(winner.label)}</strong>
                        <div class="pm-team-roster">
                          ${winner.players.map(p => `${escapeHtml(p.name)} (#${p.rank})`).join(', ')}
                        </div>
                        ${winner.applied_rule_label ? `<div class="pm-team-tie-note">Tie-break applied: ${escapeHtml(winner.applied_rule_label)}</div>` : ''}
                      </td>
                      <td>${pointsAbsent ? '&mdash;' : winner.total_points}</td>
                      <td class="pm-team-prize-value">${escapeHtml(prizeText)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            ${pointsAbsent ? `
              <p class="meta">Selected player points are unavailable. Verify the published team-prize rules and historical allocation record before relying on these rankings.</p>
            ` : ''}
          ` : `
            <p class="meta">No filled Team Prizes for this group. Check team eligibility and unresolved ranking rules.</p>
          `}
          </section>
        `;
      }).join('')}
      </section>
    `;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(tournament.title)} - Prize Allocations v${version}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #1F6E5B; }
    h2 { color: #1F6E5B; margin-top: 30px; border-bottom: 2px solid #1F6E5B; padding-bottom: 5px; }
    h3 { color: #333; margin-top: 20px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #1F6E5B; color: white; }
    .meta { color: #666; margin: 10px 0; }
    @media print {
      body { margin: 20px; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }

    /* A4 server handout: same four-column team report and brand palette as React print. */
    @page { size: A4; margin: 12mm; }
    .pm-team-report { page-break-before: always; break-before: page; color: #182c43; }
    .pm-team-report h2 { color: #9b741f; text-align: center; border-bottom: 2px solid #b38a32; padding-bottom: 3mm; }
    .pm-team-intro { text-align: center; font-size: 9pt; }
    .pm-team-group { --pm-accent: #9b741f; --pm-fill: #faf3e3; border: 1px solid #cad4df;
      border-top: 3px solid var(--pm-accent); margin: 5mm 0; break-inside: auto; page-break-inside: auto; }
    .pm-team-group[data-team-tone="teal"] { --pm-accent: #1f6e5b; --pm-fill: #eaf5ef; }
    .pm-team-group[data-team-tone="navy"] { --pm-accent: #0b3d91; --pm-fill: #eaf1fc; }
    .pm-team-group-header { text-align: center; background: var(--pm-fill);
      border-bottom: 1px solid #c7d3df; padding: 2.5mm 2mm; break-after: avoid; }
    .pm-team-group-header h3 { color: var(--pm-accent); font-size: 11pt; margin: 0; }
    .pm-team-group-header .pm-team-meta { text-align: center; color: #243246; font-size: 8pt; margin: 1mm 0 0; }
    .pm-team-table { width: 100%; table-layout: fixed; margin: 0; border-collapse: collapse; }
    .pm-team-table th { text-align: center; background: #edf2f8; color: #182c43; font-size: 7.3pt;
      padding: 2mm 1mm; border: 1px solid #bcc9d6; }
    .pm-team-table td { color: #243246; background: var(--pm-fill); padding: 1.5mm 1mm;
      font-size: 8pt; border: 1px solid #c7d3df; vertical-align: top; overflow-wrap: anywhere; }
    .pm-team-table th:nth-child(1), .pm-team-table td:nth-child(1) { width: 10%; text-align: center; }
    .pm-team-table th:nth-child(2), .pm-team-table td:nth-child(2) { width: 45%; }
    .pm-team-table th:nth-child(3), .pm-team-table td:nth-child(3) { width: 15%; text-align: center; }
    .pm-team-table th:nth-child(4), .pm-team-table td:nth-child(4) { width: 30%; text-align: center; }
    .pm-team-table td:first-child { font-weight: 800; font-size: 10pt; }
    .pm-team-table .pm-team-roster, .pm-team-table .pm-team-tie-note { color: #445368; font-size: 7.5pt; margin-top: 1mm; }
    .pm-team-table td.pm-team-prize-value { text-align: center; white-space: normal; }
    .pm-team-table tr { break-inside: avoid; page-break-inside: avoid; }
    .pm-team-table thead { display: table-header-group; }
    @media print {
      body { margin: 0; }
      .pm-team-report { page-break-before: always; break-before: page; }
      .pm-team-group-header, .pm-team-table th, .pm-team-table td {
        print-color-adjust: exact; -webkit-print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(tournament.title)}</h1>
  <div class="meta">
    <p><strong>Date:</strong> ${escapeHtml(tournament.start_date)} to ${escapeHtml(tournament.end_date)}</p>
    <p><strong>Venue:</strong> ${escapeHtml(tournament.venue || 'N/A')}</p>
    <p><strong>Version:</strong> ${version}</p>
  </div>

  <h2>Individual Prize Allocations</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th>
        <th>Player</th>
        <th>Category</th>
        <th>Prize</th>
        <th>Cash</th>
        <th>Trophy</th>
        <th>Medal</th>
      </tr>
    </thead>
    <tbody>
      ${allocations.map(a => `
        <tr>
          <td>${escapeHtml(a.players?.rank ?? 'N/A')}</td>
          <td>${escapeHtml(a.players?.name || 'N/A')}</td>
          <td>${escapeHtml(a.prizes?.categories?.name || 'N/A')}</td>
          <td>Place ${escapeHtml(a.prizes?.place ?? 'N/A')}</td>
          <td>₹${Number(a.prizes?.cash_amount || 0)}</td>
          <td>${a.prizes?.has_trophy ? '✓' : '—'}</td>
          <td>${a.prizes?.has_medal ? '✓' : '—'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  ${teamPrizesHtml}

  <p class="meta">Generated on ${new Date().toLocaleDateString()}</p>
</body>
</html>
  `;
}
