import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { defaultTeamRankingCriteria, type TeamRankingRuleConfig } from '@/utils/teamRankingV2';
import { TEAM_TIEBREAK_METHODS, findTeamTieBreakMethod } from '@/utils/teamTieBreakMethods';

/** Dropdown value for a tie-break that is not in the standard list. */
const OTHER_METHOD = 'other';
export { parseTeamRankingRuleConfig } from '@/utils/teamRankingV2';

type ImportColumn = { ordinal: number; header: string; duplicate: boolean; present: number; missing: number; invalid: number };

type Props = {
  tournamentId: string;
  open: boolean;
  value: TeamRankingRuleConfig | null;
  onChange: (value: TeamRankingRuleConfig) => void;
};

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

/** Reuses the existing Team Prizes → Edit Rules drawer. No new route or save button. */
export function TeamRankingRulesEditor({ tournamentId, open, value, onChange }: Props) {
  const draggedIndex = useRef<number | null>(null);
  // TB columns where the organizer picked "Other" but has not typed a name yet.
  const [otherOrdinals, setOtherOrdinals] = useState<ReadonlySet<number>>(new Set());
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
  const ordinals = useMemo(() => columns.map(column => column.ordinal), [columns]);
  const defaultCriteria = useMemo(() => defaultTeamRankingCriteria(ordinals), [ordinals]);
  const criteria = value?.criteria ?? defaultCriteria;

  // A new group starts with the default, without silently asserting the
  // source columns' meanings or that regulations authorize prize decisions.
  useEffect(() => {
    if (open && imported && !value) {
      onChange({
        version: 2,
        source_hash: fileHash,
        published_reference: '',
        organizer_confirmed: false,
        criteria: defaultCriteria,
      });
    }
  }, [open, imported, value, onChange, fileHash, defaultCriteria]);

  useEffect(() => {
    if (!open || !imported || !value) return;
    const missing = defaultCriteria.filter(rule =>
      rule.kind === 'source_tb' &&
      !value.criteria.some(existing => existing.kind === 'source_tb' && existing.ordinal === rule.ordinal),
    );
    if (missing.length) {
      onChange({ ...value, criteria: [...value.criteria, ...missing], organizer_confirmed: false });
    }
  }, [open, imported, value, defaultCriteria, onChange]);

  const update = (patch: Partial<TeamRankingRuleConfig>) => onChange({
    version: 2,
    ...value,
    source_hash: fileHash,
    published_reference: value?.published_reference ?? '',
    organizer_confirmed: false,
    criteria,
    ...patch,
  });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= criteria.length || from === to) return;
    const result = [...criteria];
    result.splice(to, 0, result.splice(from, 1)[0]);
    update({ criteria: result, organizer_confirmed: false });
  };

  const fileChanged = Boolean(value && value.source_hash !== fileHash);
  const importedOrdinalSet = new Set(ordinals);
  const missingRules = ordinals.filter(ordinal => !criteria.some(rule => rule.kind === 'source_tb' && rule.ordinal === ordinal));

  return (
    <section className="space-y-3 rounded-lg border p-3" aria-label="Team Ranking and Tie-breaks">
      <div>
        <h3 className="font-semibold text-sm">Ranking &amp; tie-breaks</h3>
        <p className="text-xs text-muted-foreground">Total Points is always first. Rearrange the remaining criteria to match the published event rules.</p>
      </div>
      <div className="rounded-md bg-muted/40 p-2 text-sm font-medium">1. Total Points (fixed · higher wins)</div>
      {criteria.map((criterion, index) => {
        const isVector = criterion.kind === 'score_vector';
        const source = !isVector ? columns.find(column => column.ordinal === criterion.ordinal) : undefined;
        const missing = !isVector && !importedOrdinalSet.has(criterion.ordinal);
        return (
          <div
            key={isVector ? 'score_vector' : `source_tb_${criterion.ordinal}`}
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
              <span className="flex-1 text-sm font-medium">{index + 2}. {isVector ? 'Highest individual scores' : `Individual TB${criterion.ordinal}${criterion.name.trim() ? ` · ${criterion.name.trim()}` : ''}`}</span>
              <Button type="button" variant="outline" size="icon" className="h-7 w-7"
                disabled={index === 0} title="Move up"
                aria-label={`Move criterion ${index + 2} up`}
                onClick={() => move(index, index - 1)}><ArrowUp size={14}/></Button>
              <Button type="button" variant="outline" size="icon" className="h-7 w-7"
                disabled={index === criteria.length - 1} title="Move down"
                aria-label={`Move criterion ${index + 2} down`}
                onClick={() => move(index, index + 1)}><ArrowDown size={14}/></Button>
            </div>
            {isVector ? (
              <p className="text-xs text-muted-foreground">Compare selected players' scores highest to lowest; then the next player.</p>
            ) : (() => {
              if (criterion.kind !== 'source_tb') return null;
              // "Other" keeps its text box open while typing, even when the
              // text matches a standard name; the guard still recognises it.
              const typedOther = otherOrdinals.has(criterion.ordinal);
              const matched = findTeamTieBreakMethod(criterion.name);
              const method = typedOther ? null : matched;
              const isOther = typedOther || (!matched && criterion.name.trim() !== '');
              const nonSummable = matched !== null && !matched.summable;
              const selected = method ? method.id : isOther ? OTHER_METHOD : '';
              // Any change to a tie-break's meaning must be re-confirmed.
              const setTieBreak = (patch: { name?: string; direction?: 'higher' | 'lower' }) => update({
                criteria: criteria.map((item, i) => i === index && item.kind === 'source_tb'
                  ? { ...item, ...patch, verified: false } : item),
                organizer_confirmed: false,
              });
              const setOther = (on: boolean) => setOtherOrdinals(previous => {
                const next = new Set(previous);
                if (on) next.add(criterion.ordinal); else next.delete(criterion.ordinal);
                return next;
              });
              return (
                <div className="space-y-2">
                  <p className={`text-xs ${missing || source?.duplicate || source?.invalid ? 'text-destructive' : 'text-muted-foreground'}`}>
                    Source: {source?.header ?? 'not exported'} · {source?.present ?? 0} numeric preview values · {source?.missing ?? 0} blanks · {source?.invalid ?? 0} invalid
                    {source?.duplicate ? ' · duplicate TB ordinal' : ''}
                  </p>
                  <Label htmlFor={`method-${criterion.ordinal}`}>What is TB{criterion.ordinal} in this tournament?</Label>
                  <select id={`method-${criterion.ordinal}`} className="w-full rounded border bg-background px-2 py-1 text-sm"
                    value={selected}
                    onChange={event => {
                      const next = event.target.value;
                      if (next === OTHER_METHOD) {
                        setOther(true);
                        setTieBreak({ name: method ? '' : criterion.name });
                        return;
                      }
                      setOther(false);
                      const chosen = TEAM_TIEBREAK_METHODS.find(item => item.id === next);
                      // Every standard FIDE tie-break ranks a higher value first.
                      setTieBreak({ name: chosen ? chosen.name : '', direction: 'higher' });
                    }}>
                    <option value="">Choose the tie-break this event uses…</option>
                    {TEAM_TIEBREAK_METHODS.map(item => (
                      <option key={item.id} value={item.id}>{item.optionLabel}</option>
                    ))}
                    <option value={OTHER_METHOD}>Other — type the exact name from the brochure</option>
                  </select>
                  {isOther && (
                    <Input id={`method-name-${criterion.ordinal}`} value={criterion.name}
                      aria-label={`Exact name of TB${criterion.ordinal}`}
                      placeholder="Exact tie-break name, as printed in the brochure"
                      onChange={event => setTieBreak({ name: event.target.value })}
                    />
                  )}
                  {nonSummable ? (
                    <p className="text-xs text-destructive">
                      Direct Encounter compares results between the tied players themselves, so it cannot be added up for a team.
                      This step never decides a prize automatically — a tie that reaches it needs an official ruling.
                    </p>
                  ) : method && criterion.direction === 'higher' ? (
                    <p className="text-xs text-muted-foreground">
                      Team value = sum of the counted players&apos; TB{criterion.ordinal} values · higher total wins.
                    </p>
                  ) : !method && !isOther ? (
                    <p className="text-xs text-muted-foreground">
                      Pick what TB{criterion.ordinal} means in this event. Until then, this step cannot decide a prize.
                    </p>
                  ) : (
                    <div className="flex gap-2 items-center">
                      <Label htmlFor={`direction-${criterion.ordinal}`}>Better result</Label>
                      <select id={`direction-${criterion.ordinal}`} className="rounded border bg-background px-2 py-1 text-sm"
                        value={criterion.direction}
                        onChange={event => setTieBreak({ direction: event.target.value as 'higher' | 'lower' })}>
                        <option value="higher">Higher total</option>
                        <option value="lower">Lower total</option>
                      </select>
                    </div>
                  )}
                  <Label className="flex items-start gap-2 text-xs">
                    <Checkbox checked={criterion.verified && !nonSummable}
                      disabled={!criterion.name.trim() || missing || source?.duplicate || Boolean(source?.invalid) || nonSummable}
                      onCheckedChange={checked => update({
                        criteria: criteria.map((item, i) => i === index && item.kind === 'source_tb'
                          ? { ...item, verified: checked === true } : item),
                        organizer_confirmed: false,
                      })}/>
                    I confirm that summing this individual TB for selected players is allowed by the published team-prize rules.
                  </Label>
                </div>
              );
            })()}
          </div>
        );
      })}
      {fileChanged && <p className="text-xs text-destructive">Imported Excel has changed. Review and save the rules again before relying on TBs.</p>}
      {missingRules.length > 0 && (
        <p className="text-xs text-destructive">
          Newly imported tie-breaks {missingRules.map(n => `TB${n}`).join(', ')} are not yet configured. Review source columns before prizes are finalized.
        </p>
      )}
      <Label htmlFor="published-team-rules">Published team-prize rules reference</Label>
      <Input id="published-team-rules" placeholder="e.g., tournament brochure section"
        value={value?.published_reference ?? ''} onChange={event =>
          update({ published_reference: event.target.value, organizer_confirmed: false })}/>
      <Label className="flex items-start gap-2 text-xs">
        <Checkbox checked={value?.organizer_confirmed ?? false}
          disabled={!value?.published_reference?.trim() || fileChanged || missingRules.length > 0}
          onCheckedChange={checked => update({ organizer_confirmed: checked === true })}/>
        I confirm the ranking order reflects the declared team-prize regulations.
      </Label>
      <p className="text-xs text-muted-foreground">Unsupported or unverified TBs cannot automatically decide a cash prize. Unresolved ties require an authorized ruling.</p>
    </section>
  );
}
