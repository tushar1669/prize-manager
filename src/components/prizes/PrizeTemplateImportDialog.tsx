import { useMemo, useState } from "react";
import PrizeTemplateGuideDialog from "@/components/prizes/PrizeTemplateGuideDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { applyDraftAddOnly, ApplyReport } from "@/utils/prizeApplyDraft";
import { parsePrizeTemplateFile, PrizeTemplateIssue } from "@/utils/prizeTemplateParser";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: string;
  onApplied?: () => void;
}

export default function PrizeTemplateImportDialog({ open, onOpenChange, tournamentId, onApplied }: Props) {
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [issues, setIssues] = useState<PrizeTemplateIssue[]>([]);
  const [draft, setDraft] = useState<Awaited<ReturnType<typeof parsePrizeTemplateFile>>["draft"] | null>(null);
  const [report, setReport] = useState<ApplyReport | null>(null);
  const [includeTeamGroups, setIncludeTeamGroups] = useState(true);
  const [templateGuideOpen, setTemplateGuideOpen] = useState(false);

  const totalCategoryPrizes = useMemo(() => {
    if (!draft) return 0;
    return draft.categories.reduce((sum, c) => sum + c.prizes.length, 0);
  }, [draft]);

  const canApply = !!draft && (draft.categories.length > 0 || totalCategoryPrizes > 0);

  const onFileChange = async (file?: File | null) => {
    if (!file) return;
    setParsing(true);
    setReport(null);
    try {
      const parsed = await parsePrizeTemplateFile(file);
      setDraft(parsed.draft);
      setIssues(parsed.issues);
      setIncludeTeamGroups(parsed.draft.team_groups.length > 0);
      toast.success("Template parsed. Review preview before applying.");
    } catch (err) {
      setDraft(null);
      setIssues([]);
      toast.error(err instanceof Error ? err.message : "Failed to parse template");
    } finally {
      setParsing(false);
    }
  };

  const handleApply = async () => {
    if (!draft || applying || !canApply) return;
    setApplying(true);
    try {
      const verifiedTeamGroups = new Set<number>(draft.team_groups.map((_, i) => i));
      const applyResult = await applyDraftAddOnly(tournamentId, draft, includeTeamGroups, verifiedTeamGroups);
      setReport(applyResult);
      toast.success("Template applied. Existing prizes were kept; new prizes were added.");
      onApplied?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply template");
    } finally {
      setApplying(false);
    }
  };

  const errorIssues = issues.filter((i) => i.severity === "error");
  const warningIssues = issues.filter((i) => i.severity === "warning");
  const hasTeamTemplateContent = !!draft && draft.team_groups.length > 0;
  const shouldShowTeamResultCounters = hasTeamTemplateContent || (!!report && (report.team_groups_created > 0 || report.team_groups_reused > 0 || report.team_prizes_created > 0 || report.team_prizes_skipped > 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Prizes from XLSX Template</DialogTitle>
          <DialogDescription>
            Import with the recommended simple v2 template (default path), then review and apply. {" "}
            <button type="button" className="underline" onClick={() => setTemplateGuideOpen(true)}>
              Template guide
            </button>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            <p><strong>Recommended/simple (default v2):</strong> Imports categories + individual prizes from one sheet only.</p>
            <p className="text-muted-foreground">Configure category rules in the UI after import if needed. Team Prizes are configured separately in the Team Prizes section/tab (manual flow).</p>
            <p><strong>Legacy advanced (optional):</strong> Multi-sheet format for advanced setups, including legacy team import behavior.</p>
            <p className="text-muted-foreground">Use only when needed. Advanced allocation rules are still configured in the UI.</p>
          </div>

          <p className="text-xs text-muted-foreground">
            If your file includes legacy team-group/team-prize rows, you can choose to include them after upload.
          </p>

          <Input
            type="file"
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={parsing || applying}
            onChange={(e) => onFileChange(e.target.files?.[0])}
          />

          {parsing && <p className="text-sm text-muted-foreground">Parsing template…</p>}

          {draft && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">Categories: {draft.categories.length}</Badge>
                <Badge variant="outline">Category prizes: {totalCategoryPrizes}</Badge>
                <Badge variant="outline">Team groups: {draft.team_groups.length}</Badge>
                <Badge variant="outline">Errors: {errorIssues.length}</Badge>
                <Badge variant="outline">Warnings: {warningIssues.length}</Badge>
              </div>

              {draft.team_groups.length > 0 && (
                <label className="flex items-center gap-2">
                  <Checkbox checked={includeTeamGroups} onCheckedChange={(v) => setIncludeTeamGroups(!!v)} />
                  <Label>Include legacy team groups/prizes from file (advanced)</Label>
                </label>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium">Preview</p>
                {draft.categories.map((category) => (
                  <div key={category.name} className="rounded border p-2 text-sm">
                    <div className="font-medium">{category.name}{category.is_main ? " (Main)" : ""}</div>
                    <div className="text-muted-foreground">Prizes: {category.prizes.length}</div>
                  </div>
                ))}
                {draft.team_groups.map((group) => (
                  <div key={group.name} className="rounded border p-2 text-sm">
                    <div className="font-medium">Team Group: {group.name}</div>
                    <div className="text-muted-foreground">Prizes: {group.prizes.length}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(errorIssues.length > 0 || warningIssues.length > 0) && (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="text-sm font-medium">Validation Issues</p>
              <ul className="text-xs space-y-1">
                {issues.map((issue, idx) => (
                  <li key={`${issue.sheet}-${issue.row}-${idx}`}>
                    <span className="font-medium">[{issue.severity.toUpperCase()}]</span> {issue.sheet} row {issue.row}: {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report && (
            <div className="space-y-1 rounded-md border p-3 text-sm">
              <p className="font-medium">Apply Result</p>
              <p>Categories created: {report.categories_created}; reused: {report.categories_reused}</p>
              <p>Prizes added: {report.prizes_created}; already in your tournament: {report.prizes_skipped_existing}; duplicate rows in this file (added once): {report.prizes_skipped_duplicate_in_draft}</p>
              {shouldShowTeamResultCounters ? (
                <>
                  <p>Team groups created: {report.team_groups_created}; reused: {report.team_groups_reused}</p>
                  <p>Team prizes created: {report.team_prizes_created}; not added (already existed): {report.team_prizes_skipped}</p>
                </>
              ) : (
                <p className="text-muted-foreground">No legacy team-group/team-prize rows were found in this file.</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>Close</Button>
          <Button onClick={handleApply} disabled={!canApply || parsing || applying}>
            {applying ? "Applying…" : "Apply Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
      <PrizeTemplateGuideDialog open={templateGuideOpen} onOpenChange={setTemplateGuideOpen} />
    </Dialog>
  );
}
