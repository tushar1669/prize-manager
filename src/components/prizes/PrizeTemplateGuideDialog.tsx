import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface PrizeTemplateGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const supportedColumns = [
  "Category",
  "Is Main",
  "Place",
  "Cash Amount",
  "Trophy",
  "Medal",
  "Gift Name",
  "Gift Qty",
  "Notes",
];

const sampleRows = [
  {
    category: "Open",
    isMain: "yes",
    place: "1",
    cashAmount: "25000",
    trophy: "yes",
    medal: "gold",
    giftName: "Gift Hamper",
    giftQty: "1",
    notes: "Open winner",
  },
  {
    category: "Open",
    isMain: "yes",
    place: "2",
    cashAmount: "15000",
    trophy: "no",
    medal: "silver",
    giftName: "",
    giftQty: "",
    notes: "Open runner-up",
  },
  {
    category: "U1600",
    isMain: "no",
    place: "1",
    cashAmount: "5000",
    trophy: "no",
    medal: "bronze",
    giftName: "Chess Book",
    giftQty: "1",
    notes: "Rating category winner",
  },
];

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
            <p className="mt-1 text-muted-foreground">{supportedColumns.join(", ")}</p>
          </div>

          <div className="rounded-md border p-3">
            <p className="font-medium mb-2">Sample rows</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-1">Category</th><th className="p-1">Is Main</th><th className="p-1">Place</th><th className="p-1">Cash Amount</th><th className="p-1">Trophy</th><th className="p-1">Medal</th><th className="p-1">Gift Name</th><th className="p-1">Gift Qty</th><th className="p-1">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {sampleRows.map((row, idx) => (
                    <tr key={`${row.category}-${row.place}-${idx}`} className="border-b">
                      <td className="p-1">{row.category}</td>
                      <td className="p-1">{row.isMain}</td>
                      <td className="p-1">{row.place}</td>
                      <td className="p-1">{row.cashAmount}</td>
                      <td className="p-1">{row.trophy}</td>
                      <td className="p-1">{row.medal}</td>
                      <td className="p-1">{row.giftName}</td>
                      <td className="p-1">{row.giftQty}</td>
                      <td className="p-1">{row.notes}</td>
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
