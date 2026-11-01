import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  defaultTeamRankingCriteria, isComparableImportedTieBreak, teamCriterionId,
  type TeamRankingCriterion, type TeamRankingRuleConfig,
} from '@/utils/teamRankingV2';
import { tieBreakMethodFromSwissManagerCode } from '@/utils/teamTieBreakMethods';

export { parseTeamRankingRuleConfig } from '@/utils/teamRankingV2';
export type { TeamRankingRuleConfig } from '@/utils/teamRankingV2';

type ImportColumn = { ordinal: number; header: string; duplicate: boolean; present: number; missing: number; invalid: number };

type Props = {
  tournamentId: string;
  open: boolean;
  value: TeamRankingRuleConfig | null;
  onChange: (value: TeamRankingRuleConfig) => void;
};

/** Steps an organizer can add; none needs an Excel to have been imported. */
const BUILT_IN_STEPS: Array<{ id: string; label: string; rule: TeamRankingCriterion }> = [
  { id: 'score_vector', label: 'Highest individual scores', rule: { kind: 'score_vector' } },
  { id: 'best_rank', label: 'Best individual rank', rule: { kind: 'best_rank' } },
  { id: 'imported_tbs', label: 'Imported individual tie-breaks (TB1, TB2, … from the Excel)', rule: { kind: 'imported_tbs' } },
];

function sourceColumns(meta: unknown): ImportColumn[] {
  if (!meta || typeof meta !== 'object') return [];
  const values = (meta as Record<string, unknown>).individual_tb_columns;
  if (!Array.isArray(values)) return [];
  return values.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as Record<string, unknown>;
    const ordinal = raw.ordinal;
    if (typeof ordinal !== 'number' || !Number.isSafeInteger(ordinal) || ordinal < 1) return [];
    return [{
      ordinal: Number(ordinal),
      header: String(raw.header ?? ''),
      duplicate: raw.duplicate === true,
      present: Number(raw.present ?? 0),
      missing: Number(raw.missing ?? 0),
      invalid: Number(raw.invalid ?? 0),
    }];
  }).sort((a, b) => a.ordinal - b.ordinal);
}

/** "TB1 · BH:GP/C1 (Buchholz Cut-1)"; a bare "TB3" heading names no method. */
function describeColumn(column: ImportColumn): string {
  const header = column.header.trim();
  if (!header || /^t[\s._-]*b[\s._-]*0*\d+$/i.test(header)) return `TB${column.ordinal} (the file does not say which tie-break)`;
  const method = tieBreakMethodFromSwissManagerCode(header);
  return `TB${column.ordinal} · ${header}${method ? ` (${method.name})` : ''}`;
}

/** Reuses the existing Team Prizes → Edit Rules drawer. No new route or save button. */
export function TeamRankingRulesEditor({ tournamentId, open, value, onChange }: Props) {
  const draggedIndex = useRef<number | null>(null);
  const { data: imported } = useQuery({
    queryKey: ['team-ranking-import-source', tournamentId],
    enabled: open && !!tournamentId,
    queryFn: async () => {
      const { data, error } = await supabase.from('import_logs')
        .select('file_hash,meta,imported_at')
        .eq('tournament_id', tournamentId)
        .order('imported_at', { ascending: false })
        .limit(15);
      if (error) throw error;
      const chosen = (data ?? []).find(row => {
        const meta = row.meta as Record<string, unknown> | null;
        return meta?.import_success === true;
      });
      return chosen ? {
        fileHash: chosen.file_hash ?? null,
        columns: sourceColumns(chosen.meta),
      } : { fileHash: null, columns: [] as ImportColumn[] };
    },
  });

  const fileHash = imported?.fileHash ?? null;
  const columns = imported?.columns ?? [];
  const criteria = value?.criteria ?? defaultTeamRankingCriteria();
  // Only an older per-column "TBn" step is tied to one imported file.
  const usesFileBoundSteps = criteria.some(rule => rule.kind === 'source_tb');

  // A new group starts with the default order, unconfirmed.
  useEffect(() => {
    if (open && imported && !value) {
      onChange({
        version: 2,
        source_hash: null,
        published_reference: '',
        organizer_confirmed: false,
        criteria: defaultTeamRankingCriteria(),
      });
    }
  }, [open, imported, value, onChange]);

  const update = (patch: Partial<TeamRankingRuleConfig>) => {
    const next: TeamRankingRuleConfig = {
      version: 2,
      ...value,
      source_hash: null,
      published_reference: value?.published_reference ?? '',
      organizer_confirmed: false,
      criteria,
      ...patch,
    };
    next.source_hash = next.criteria.some(rule => rule.kind === 'source_tb') ? fileHash : null;
    onChange(next);
  };

  const remove = (at: number) =>
    update({ criteria: criteria.filter((_, i) => i !== at), organizer_confirmed: false });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= criteria.length || from === to) return;
    const result = [...criteria];
    result.splice(to, 0, result.splice(from, 1)[0]);
    update({ criteria: result, organizer_confirmed: false });
  };

  const fileChanged = Boolean(value && usesFileBoundSteps && value.source_hash !== fileHash);
  // Ranks are unique, so nothing after "Best individual rank" is ever reached.
  const bestRankIndex = criteria.findIndex(rule => rule.kind === 'best_rank');
  const present = new Set(criteria.map(teamCriterionId));
  const addable = BUILT_IN_STEPS.filter(step => !present.has(step.id));
  const importIssues = columns.some(column => column.duplicate || column.invalid > 0);

  return (
    <section className="space-y-3 rounded-lg border p-3" aria-label="Team Ranking and Tie-breaks">
      <div>
        <h3 className="font-semibold text-sm">Ranking &amp; tie-breaks</h3>
        <p className="text-xs font-medium text-warning">
          Team Prizes V2 only: these steps decide prizes only on tournaments enabled for Team V2.
        </p>
        <p className="text-xs text-muted-foreground">
          Total Points is always first. Add, remove and drag the steps below to match the published event rules.
          Only listed steps can decide a prize. You can set this before importing the Excel.
        </p>
      </div>
      <div className="rounded-md bg-muted/40 p-2 text-sm font-medium">1. Total Points (fixed · higher wins)</div>
      {criteria.map((criterion, index) => {
        const title = criterion.kind === 'score_vector' ? 'Highest individual scores'
          : criterion.kind === 'best_rank' ? 'Best individual rank'
          : criterion.kind === 'imported_tbs' ? 'Imported individual tie-breaks'
          : `Individual TB${criterion.ordinal}${criterion.name.trim() ? ` · ${criterion.name.trim()}` : ''} (older step)`;
        const notReached = bestRankIndex >= 0 && index > bestRankIndex;
        return (
          <div
            key={teamCriterionId(criterion)}
            className="space-y-2 rounded-md border p-2"
            draggable
            onDragStart={() => { draggedIndex.current = index; }}
            onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault();
              if (draggedIndex.current !== null) move(draggedIndex.current, index);
              draggedIndex.current = null;
            }}
            onDragEnd={() => { draggedIndex.current = null; }}
          >
            <div className="flex items-center gap-2">
              <GripVertical size={16} className="text-muted-foreground shrink-0" aria-hidden="true"/>
              <span className="flex-1 text-sm font-medium">{index + 2}. {title}</span>
              <Button type="button" variant="outline" size="icon" className="h-7 w-7"
                disabled={index === 0} title="Move up"
                aria-label={`Move criterion ${index + 2} up`}
                onClick={() => move(index, index - 1)}><ArrowUp size={14}/></Button>
              <Button type="button" variant="outline" size="icon" className="h-7 w-7"
                disabled={index === criteria.length - 1} title="Move down"
                aria-label={`Move criterion ${index + 2} down`}
                onClick={() => move(index, index + 1)}><ArrowDown size={14}/></Button>
              <Button type="button" variant="outline" size="icon" className="h-7 w-7"
                title="Remove step"
                aria-label={`Remove criterion ${index + 2}`}
                onClick={() => remove(index)}><X size={14}/></Button>
            </div>
            {notReached && (
              <p className="text-xs text-muted-foreground">
                Not reached: Best individual rank above always decides, because every player has a different rank.
                Move this step above it if the event rules use it first.
              </p>
            )}
            {criterion.kind === 'score_vector' ? (
              <p className="text-xs text-muted-foreground">Compare selected players&apos; scores highest to lowest; then the next player.</p>
            ) : criterion.kind === 'best_rank' ? (
              <p className="text-xs text-muted-foreground">
                The team whose best counted player is placed higher wins (rank 2 beats rank 5).
                Every player has a different rank, so this step always decides.
              </p>
            ) : criterion.kind === 'imported_tbs' ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Uses each player&apos;s TB1, TB2, … from the imported Excel, in the file&apos;s order. First TB1 of each
                  team&apos;s 1st player (best rank), then TB1 of the 2nd player, and so on. Only if TB1 is equal for
                  every player does it move to TB2, starting again from the 1st player. Higher wins.
                </p>
                {!imported ? (
                  <p className="text-xs text-muted-foreground">Checking the latest import…</p>
                ) : columns.length > 0 ? (
                  <div className="text-xs text-muted-foreground">
                    <p>From the latest import:</p>
                    <ul className="list-disc pl-4">
                      {columns.map(column => (
                        <li key={column.ordinal}>
                          {describeColumn(column)}
                          {!isComparableImportedTieBreak(column.header) && ' — skipped: Direct Encounter cannot be compared between different players'}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : fileHash ? (
                  <p className="text-xs text-destructive">
                    The latest import has no tie-break columns (TB1, TB2 … or Swiss-Manager codes such as BH:GP/C1).
                    A tie that reaches this step will be held for a ruling.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No Excel imported yet. That is fine: the tie-break columns are read from the Excel when prizes are
                    allocated, so you do not need to come back here after importing.
                  </p>
                )}
                {importIssues && (
                  <p className="text-xs text-destructive">
                    The latest import has duplicate tie-break columns or non-numeric values. Blank or unclear values are
                    never guessed: a tie that needs one is held for a ruling.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Older step that adds up one tie-break for the team. Remove it and use “Imported individual tie-breaks” instead.
              </p>
            )}
          </div>
        );
      })}
      {addable.length > 0 && (
        <div className="flex items-center gap-2">
          <Label htmlFor="add-ranking-step" className="text-xs">Add a tie-break step</Label>
          <select id="add-ranking-step" className="rounded border bg-background px-2 py-1 text-sm" value=""
            onChange={event => {
              const next = addable.find(option => option.id === event.target.value);
              if (next) update({ criteria: [...criteria, next.rule], organizer_confirmed: false });
            }}>
            <option value="">Choose a step…</option>
            {addable.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </div>
      )}
      {fileChanged && <p className="text-xs text-destructive">Imported Excel has changed. Review and save the rules again before relying on the older TB steps.</p>}
      <Label htmlFor="published-team-rules">Published team-prize rules reference</Label>
      <Input id="published-team-rules" placeholder="e.g., tournament brochure section"
        value={value?.published_reference ?? ''} onChange={event =>
          update({ published_reference: event.target.value, organizer_confirmed: false })}/>
      <Label className="flex items-start gap-2 text-xs">
        <Checkbox checked={value?.organizer_confirmed ?? false}
          disabled={!value?.published_reference?.trim() || fileChanged}
          onCheckedChange={checked => update({ organizer_confirmed: checked === true })}/>
        I confirm the ranking order reflects the declared team-prize regulations.
      </Label>
      <p className="text-xs text-muted-foreground">Blank or unclear tie-break values never decide a cash prize automatically. Unresolved ties require an authorized ruling.</p>
    </section>
  );
}
