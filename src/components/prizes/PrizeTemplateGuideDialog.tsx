import { PRIZE_TEMPLATE_V2_HEADERS, PRIZE_TEMPLATE_V2_SAMPLE_ROWS } from "@/constants/prizeTemplateV2";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface PrizeTemplateGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PrizeTemplateGuideDialog({ open, onOpenChange }: PrizeTemplateGuideDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How to use the template</DialogTitle>
          <DialogDescription>
            Use the default v2 prize template path to import categories and individual prize rows in one pass. Fill one row per individual prize entry.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="font-medium">Supported columns (default v2 simplified path)</p>
            <p className="mt-1 text-muted-foreground">{PRIZE_TEMPLATE_V2_HEADERS.join(", ")}</p>
          </div>

          <div className="rounded-md border p-3">
            <p className="font-medium mb-2">Sample rows</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left">
                    {PRIZE_TEMPLATE_V2_HEADERS.map((header) => (
                      <th key={header} className="p-1">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PRIZE_TEMPLATE_V2_SAMPLE_ROWS.map((row, idx) => (
                    <tr key={`${row[0]}-${row[2]}-${idx}`} className="border-b">
                      {row.map((value, valueIdx) => (
                        <td key={`${idx}-${valueIdx}`} className="p-1">{value}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-md border border-amber-300 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/30 space-y-1">
            <p><strong>Rules are configured in the UI.</strong> After import, set/adjust category rules in Tournament Setup.</p>
            <p><strong>Team Prizes are configured in the Team Prizes section/tab.</strong> The default v2 template path does not configure Team Prizes.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
