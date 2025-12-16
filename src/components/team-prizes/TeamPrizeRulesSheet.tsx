import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { GROUP_BY_OPTIONS, SCORING_MODE_OPTIONS, type InstitutionPrizeGroup } from './types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: Partial<InstitutionPrizeGroup> | null;
  tournamentId: string;
  onSave: (data: Omit<InstitutionPrizeGroup, 'id' | 'created_at' | 'updated_at'> & { id?: string }) => Promise<void>;
  saving?: boolean;
}

export default function TeamPrizeRulesSheet({ open, onOpenChange, group, tournamentId, onSave, saving }: Props) {
  const [name, setName] = useState('');
  const [groupBy, setGroupBy] = useState('club');
  const [teamSize, setTeamSize] = useState(4);
  const [femaleSlots, setFemaleSlots] = useState(0);
  const [maleSlots, setMaleSlots] = useState(0);
  const [scoringMode, setScoringMode] = useState('by_top_k_score');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset form when group changes
  useEffect(() => {
    if (group) {
      setName(group.name || '');
      setGroupBy(group.group_by || 'club');
      setTeamSize(group.team_size || 4);
      setFemaleSlots(group.female_slots || 0);
      setMaleSlots(group.male_slots || 0);
      setScoringMode(group.scoring_mode || 'by_top_k_score');
    } else {
      // Defaults for new group
      setName('');
      setGroupBy('club');
      setTeamSize(4);
      setFemaleSlots(0);
      setMaleSlots(0);
      setScoringMode('by_top_k_score');
    }
    setValidationError(null);
  }, [group, open]);

  // Validate gender slots constraint
  useEffect(() => {
    if (femaleSlots + maleSlots > teamSize) {
      setValidationError(`Gender slots (${femaleSlots} + ${maleSlots} = ${femaleSlots + maleSlots}) cannot exceed team size (${teamSize})`);
    } else {
      setValidationError(null);
    }
  }, [femaleSlots, maleSlots, teamSize]);

  const handleSave = async () => {
    // Validate
    if (!name.trim()) {
      setValidationError('Name is required');
      return;
    }
    if (teamSize < 1) {
      setValidationError('Team size must be at least 1');
      return;
    }
    if (femaleSlots < 0 || maleSlots < 0) {
      setValidationError('Gender slots cannot be negative');
      return;
    }
    if (femaleSlots + maleSlots > teamSize) {
      setValidationError(`Gender slots cannot exceed team size`);
      return;
    }

    await onSave({
      id: group?.id,
      tournament_id: tournamentId,
      name: name.trim(),
      group_by: groupBy,
      team_size: teamSize,
      female_slots: femaleSlots,
      male_slots: maleSlots,
      scoring_mode: scoringMode,
      is_active: group?.is_active ?? true,
    });
  };

  const selectedGroupByOption = GROUP_BY_OPTIONS.find(o => o.value === groupBy);
  const isEdit = !!group?.id;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Team Rules' : 'Add Team Prize Group'}</SheetTitle>
          <SheetDescription>
            Configure how teams are formed and scored for institution/team prizes.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="team-name">Group Name</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Best School, Best Academy, Best City Team"
            />
          </div>

          {/* Group By */}
          <div className="space-y-2">
            <Label htmlFor="group-by">Group Players By</Label>
            <Select value={groupBy} onValueChange={setGroupBy}>
              <SelectTrigger>
                <SelectValue placeholder="Select grouping field" />
              </SelectTrigger>
              <SelectContent>
                {GROUP_BY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedGroupByOption && (
              <p className="text-xs text-muted-foreground">
                {selectedGroupByOption.description}
              </p>
            )}
          </div>

          {/* Team Size */}
          <div className="space-y-2">
            <Label htmlFor="team-size">Team Size</Label>
            <Input
              id="team-size"
              type="number"
              min={1}
              max={20}
              value={teamSize}
              onChange={(e) => setTeamSize(parseInt(e.target.value) || 1)}
            />
            <p className="text-xs text-muted-foreground">
              Number of players counted per team for scoring.
            </p>
          </div>

          {/* Gender Mix */}
          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Gender Requirements</Label>
              <span className="text-xs text-muted-foreground">Optional</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="female-slots">Female Slots</Label>
                <Input
                  id="female-slots"
                  type="number"
                  min={0}
                  max={teamSize}
                  value={femaleSlots}
                  onChange={(e) => setFemaleSlots(parseInt(e.target.value) || 0)}
                  className={cn(validationError && femaleSlots + maleSlots > teamSize ? 'border-destructive' : '')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="male-slots">Male Slots</Label>
                <Input
                  id="male-slots"
                  type="number"
                  min={0}
                  max={teamSize}
                  value={maleSlots}
                  onChange={(e) => setMaleSlots(parseInt(e.target.value) || 0)}
                  className={cn(validationError && femaleSlots + maleSlots > teamSize ? 'border-destructive' : '')}
                />
              </div>
            </div>

            {validationError && (
              <p className="text-sm text-destructive font-medium">{validationError}</p>
            )}

            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Examples:</strong></p>
              <p>• team_size=4, female_slots=2, male_slots=2 → exactly 2 girls + 2 boys</p>
              <p>• team_size=5, female_slots=2, male_slots=0 → at least 2 girls, rest can be any gender</p>
              <p>• team_size=4, female_slots=0, male_slots=0 → no gender requirements</p>
              <p className="pt-2 italic">
                If slots sum to less than team_size, remaining boards are filled by best remaining players of any gender.
              </p>
            </div>
          </div>

          {/* Scoring Mode */}
          <div className="space-y-2">
            <Label htmlFor="scoring-mode">Scoring Mode</Label>
            <Select value={scoringMode} onValueChange={setScoringMode} disabled>
              <SelectTrigger>
                <SelectValue placeholder="Select scoring mode" />
              </SelectTrigger>
              <SelectContent>
                {SCORING_MODE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {SCORING_MODE_OPTIONS.find(o => o.value === scoringMode)?.description}
            </p>
            <p className="text-xs text-muted-foreground">
              More scoring modes can be added later (Phase 2.2).
            </p>
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={saving || !!validationError || !name.trim()}
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Group'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
