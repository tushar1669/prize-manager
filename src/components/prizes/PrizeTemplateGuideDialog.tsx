import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface PrizeTemplateGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const supportedColumns = [
  "Category",
  "Is Main Category",
  "Prize Name",
  "Prize Type",
  "Amount",
  "Currency",
  "Rank From",
  "Rank To",
  "Tie Split",
  "Description",
];

const sampleRows = [
  {
    category: "Open",
    isMainCategory: "yes",
    prizeName: "1st Place",
    prizeType: "cash",
    amount: "25000",
    currency: "INR",
    rankFrom: "1",
    rankTo: "1",
    tieSplit: "yes",
    description: "Open winner",
  },
  {
    category: "Open",
    isMainCategory: "yes",
    prizeName: "2nd Place",
    prizeType: "cash",
    amount: "15000",
    currency: "INR",
    rankFrom: "2",
    rankTo: "2",
    tieSplit: "yes",
    description: "Open runner-up",
  },
  {
    category: "U1600",
    isMainCategory: "no",
    prizeName: "Best U1600",
    prizeType: "cash",
    amount: "5000",
    currency: "INR",
    rankFrom: "1",
    rankTo: "1",
    tieSplit: "yes",
    description: "Rating category winner",
  },
];

export default function PrizeTemplateGuideDialog({ open, onOpenChange }: PrizeTemplateGuideDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How to use the template</DialogTitle>
          <DialogDescription>
            Use the default v2 prize template to add prize categories and individual category prizes in one pass. Fill one row per prize entry.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="font-medium">Supported columns (default v2 simplified path)</p>
            <p className="mt-1 text-muted-foreground">{supportedColumns.join(", ")}</p>
          </div>

          <div className="rounded-md border p-3">
            <p className="font-medium mb-2">Sample rows</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-1">Category</th><th className="p-1">Main</th><th className="p-1">Prize Name</th><th className="p-1">Type</th><th className="p-1">Amount</th><th className="p-1">Currency</th><th className="p-1">Rank From</th><th className="p-1">Rank To</th><th className="p-1">Tie Split</th><th className="p-1">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {sampleRows.map((row, idx) => (
                    <tr key={`${row.category}-${row.prizeName}-${idx}`} className="border-b">
                      <td className="p-1">{row.category}</td>
                      <td className="p-1">{row.isMainCategory}</td>
                      <td className="p-1">{row.prizeName}</td>
                      <td className="p-1">{row.prizeType}</td>
                      <td className="p-1">{row.amount}</td>
                      <td className="p-1">{row.currency}</td>
                      <td className="p-1">{row.rankFrom}</td>
                      <td className="p-1">{row.rankTo}</td>
                      <td className="p-1">{row.tieSplit}</td>
                      <td className="p-1">{row.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-md border border-amber-300 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/30 space-y-1">
            <p><strong>Rules are configured in the UI.</strong> After import, set/adjust category rules in Tournament Setup.</p>
            <p><strong>Team Prizes are configured in the Team Prizes section/tab.</strong> They are not the main focus of this default guide flow.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
