import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IMPORT_LOGS_ENABLED } from "@/utils/featureFlags";

type TieRankSummaryRow = {
  rowIndex: number;
  excelRowNumber?: number;
  tieAnchorRank: number;
  imputedRank: number;
  nextPrintedRank?: number | null;
};

type TieRankSummaryWarning = {
  rowIndex: number;
  excelRowNumber?: number;
  message: string;
};

type DobSummaryRow = {
  rowNumber: number;
  rank: number | null;
  dob_original: string | null;
  dob_saved: string | null;
};

type ImportSummary = {
  tieRanks: {
    totalImputed: number;
    rows: TieRankSummaryRow[];
    warnings: TieRankSummaryWarning[];
  };
  dob: {
    totalImputed: number;
    rows: DobSummaryRow[];
  };
};

type ImportQualityNotesProps = {
  tournamentId: string;
};

type ImportQualityData = {
  summary: ImportSummary;
  persistenceEnabled: boolean;
};

const asNumber = (value: unknown, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const asString = (value: unknown) => (value == null ? null : String(value));

const parseImportSummary = (meta: unknown): ImportSummary | null => {
  if (!meta || typeof meta !== "object") return null;
  const wrappedSummary = (meta as { import_summary?: unknown }).import_summary;
  const summary = wrappedSummary && typeof wrappedSummary === "object" ? wrappedSummary : meta;
  if (!summary || typeof summary !== "object") return null;
  const tieRanksRaw = (summary as { tieRanks?: unknown }).tieRanks;
  const dobRaw = (summary as { dob?: unknown }).dob;

  const tieRanksObj = tieRanksRaw && typeof tieRanksRaw === "object" ? tieRanksRaw : {};
  const dobObj = dobRaw && typeof dobRaw === "object" ? dobRaw : {};

  const tieRows = Array.isArray((tieRanksObj as { rows?: unknown }).rows)
    ? (tieRanksObj as { rows: unknown[] }).rows
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const typed = row as TieRankSummaryRow;
          return {
            rowIndex: asNumber(typed.rowIndex),
            excelRowNumber: typed.excelRowNumber != null ? asNumber(typed.excelRowNumber) : undefined,
            tieAnchorRank: asNumber(typed.tieAnchorRank),
            imputedRank: asNumber(typed.imputedRank),
            nextPrintedRank:
              typed.nextPrintedRank == null ? null : asNumber(typed.nextPrintedRank),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row != null)
    : [];

  const tieWarnings = Array.isArray((tieRanksObj as { warnings?: unknown }).warnings)
    ? (tieRanksObj as { warnings: unknown[] }).warnings
        .map((warning) => {
          if (!warning || typeof warning !== "object") return null;
          const typed = warning as TieRankSummaryWarning;
          return {
            rowIndex: asNumber(typed.rowIndex),
            excelRowNumber: typed.excelRowNumber != null ? asNumber(typed.excelRowNumber) : undefined,
            message: String(typed.message ?? ""),
          };
        })
        .filter((warning): warning is NonNullable<typeof warning> => warning != null)
    : [];

  const dobRows = Array.isArray((dobObj as { rows?: unknown }).rows)
    ? (dobObj as { rows: unknown[] }).rows
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const typed = row as DobSummaryRow;
          return {
            rowNumber: asNumber(typed.rowNumber),
            rank: typed.rank != null ? asNumber(typed.rank) : null,
            dob_original: asString(typed.dob_original),
            dob_saved: asString(typed.dob_saved),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row != null)
    : [];

  return {
    tieRanks: {
      totalImputed: asNumber((tieRanksObj as { totalImputed?: unknown }).totalImputed),
      rows: tieRows,
      warnings: tieWarnings,
    },
    dob: {
      totalImputed: asNumber((dobObj as { totalImputed?: unknown }).totalImputed),
      rows: dobRows,
    },
  };
};

export function ImportQualityNotes({ tournamentId }: ImportQualityNotesProps) {
  const [showTieRankDetails, setShowTieRankDetails] = useState(false);
  const [showDobDetails, setShowDobDetails] = useState(false);

  const { data } = useQuery<ImportQualityData | null>({
    queryKey: ["import-quality", tournamentId],
    enabled: Boolean(tournamentId),
    queryFn: async () => {
      if (!IMPORT_LOGS_ENABLED) return null;

      const isMissingColumnError = (error: { message?: string } | null) =>
        Boolean(
          error?.message?.includes("latest_import_quality") &&
            error.message.includes("does not exist"),
        );

      const { data: tournamentData, error: tournamentError } = await supabase
        .from("tournaments")
        .select("latest_import_quality")
        .eq("id", tournamentId)
        .maybeSingle();

      if (tournamentError && !isMissingColumnError(tournamentError)) {
        throw tournamentError;
      }

      if (!tournamentError && tournamentData?.latest_import_quality) {
        const summary = parseImportSummary(tournamentData.latest_import_quality);
        return summary ? { summary, persistenceEnabled: true } : null;
      }

      const { data, error } = await supabase
        .from("import_logs")
        .select("id, imported_at, meta")
        .eq("tournament_id", tournamentId)
        .filter("meta->>import_success", "eq", "true")
        .order("imported_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      const summary = parseImportSummary(data?.meta ?? null);
      return summary
        ? { summary, persistenceEnabled: !tournamentError }
        : null;
    },
  });

  if (!data) return null;
  const summary = data.summary;

  const tieImputed = summary.tieRanks.totalImputed;
  const dobImputed = summary.dob.totalImputed;
  const showTie = tieImputed > 0;
  const showDob = dobImputed > 0;

  if (!showTie && !showDob) return null;

  return (
    <Card className="mb-6" data-testid="import-quality-notes">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Data Quality Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {!data.persistenceEnabled && (
          <p className="text-xs text-muted-foreground">
            Persistence not enabled (DB not migrated).
          </p>
        )}
        {showTie && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">Tie ranks filled:</span>
            <span>{tieImputed}</span>
            <Button
              type="button"
              variant="link"
              className="h-auto p-0"
              onClick={() => setShowTieRankDetails(true)}
            >
              View details
            </Button>
          </div>
        )}
        {showDob && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">DOB year-only inferred:</span>
            <span>{dobImputed}</span>
            <Button
              type="button"
              variant="link"
              className="h-auto p-0"
              onClick={() => setShowDobDetails(true)}
            >
              View details
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={showTieRankDetails} onOpenChange={setShowTieRankDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tie rank imputation details</DialogTitle>
            <DialogDescription>
              Blank rank cells between tied entries were filled to keep continuous rankings for prize allocation.
            </DialogDescription>
          </DialogHeader>
          {summary.tieRanks.rows.length ? (
            <div className="max-h-80 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Anchor rank</TableHead>
                    <TableHead>Imputed rank</TableHead>
                    <TableHead>Next printed rank</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.tieRanks.rows.map((row) => (
                    <TableRow key={`${row.rowIndex}-${row.imputedRank}`}>
                      <TableCell>{row.excelRowNumber ?? row.rowIndex + 1}</TableCell>
                      <TableCell>{row.tieAnchorRank}</TableCell>
                      <TableCell>{row.imputedRank}</TableCell>
                      <TableCell>
                        {row.nextPrintedRank == null ? "(end of sheet)" : row.nextPrintedRank}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No imputed ranks to display.</p>
          )}
          {summary.tieRanks.warnings.length ? (
            <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900">
              <div className="font-medium">Warnings</div>
              <ul className="mt-2 list-disc pl-5">
                {summary.tieRanks.warnings.map((warning) => (
                  <li key={`${warning.rowIndex}-${warning.message}`}>
                    Row {warning.excelRowNumber ?? warning.rowIndex + 1}: {warning.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={showDobDetails} onOpenChange={setShowDobDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>DOB year-only conversion details</DialogTitle>
            <DialogDescription>
              Year-only DOB values were converted to January 1 to keep imports compatible with the database.
            </DialogDescription>
          </DialogHeader>
          {summary.dob.rows.length ? (
            <div className="max-h-80 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Rank</TableHead>
                    <TableHead>DOB original</TableHead>
                    <TableHead>DOB saved</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.dob.rows.map((row) => (
                    <TableRow key={`${row.rowNumber}-${row.rank ?? "na"}`}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>{row.rank ?? ""}</TableCell>
                      <TableCell>{row.dob_original ?? ""}</TableCell>
                      <TableCell>{row.dob_saved ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No DOB conversions to display.</p>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
