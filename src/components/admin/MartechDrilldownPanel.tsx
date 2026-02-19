import { X, ChevronLeft, ChevronRight, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DrilldownSelection } from "@/hooks/useMartechDrilldown";

interface MartechDrilldownPanelProps {
  selection: NonNullable<DrilldownSelection>;
  rows: Record<string, unknown>[];
  totalCount: number;
  isLoading: boolean;
  error: Error | null;
  page: number;
  pageSize: number;
  limitation: string | null;
  onPageChange: (page: number) => void;
  onClose: () => void;
}

const CHART_LABELS: Record<string, string> = {
  organizer_funnel: "Organizer Funnel",
  tournament_funnel: "Tournament Funnel",
  revenue: "Revenue Proxy",
};

function formatCellValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return new Date(value).toLocaleDateString();
  }
  return String(value);
}

function truncateId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…`;
}

export function MartechDrilldownPanel({
  selection,
  rows,
  totalCount,
  isLoading,
  error,
  page,
  pageSize,
  limitation,
  onPageChange,
  onClose,
}: MartechDrilldownPanelProps) {
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, totalCount);

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base">
            {CHART_LABELS[selection.chart] ?? selection.chart} → {selection.key}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {totalCount} row{totalCount !== 1 ? "s" : ""} total
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close drill-down">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {limitation && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>Data limitation: {limitation}</span>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading…
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">Failed to load drill-down data.</p>
        )}

        {!isLoading && !error && rows.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">No rows found for this selection.</p>
        )}

        {!isLoading && rows.length > 0 && (
          <>
            <div className="overflow-x-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((col) => (
                      <TableHead key={col} className="text-xs whitespace-nowrap">
                        {col.replace(/_/g, " ")}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => (
                    <TableRow key={idx}>
                      {columns.map((col) => (
                        <TableCell key={col} className="text-xs whitespace-nowrap">
                          {col.endsWith("_id") || col === "id"
                            ? truncateId(formatCellValue(row[col]))
                            : formatCellValue(row[col])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Showing {from}–{to} of {totalCount}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={page === 0}
                  onClick={() => onPageChange(page - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="px-2">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={page + 1 >= totalPages}
                  onClick={() => onPageChange(page + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
