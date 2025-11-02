import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { IMPORT_LOGS_ENABLED } from "@/utils/featureFlags";
import type { Database } from "@/integrations/supabase/types";

const MAX_REASONS = 3;
const MAX_SAMPLE_ERRORS = 5;

type ImportLogRow = Database["public"]["Tables"]["import_logs"]["Row"];

type Props = {
  tournamentId: string;
};

function parseReasons(value: ImportLogRow["top_reasons"]): Array<{ reason: string; count: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (entry && typeof entry === "object" && "reason" in entry) {
        return {
          reason: String((entry as { reason?: unknown }).reason ?? "Unknown"),
          count: Number((entry as { count?: unknown }).count ?? 0)
        };
      }
      return null;
    })
    .filter((entry): entry is { reason: string; count: number } => !!entry && entry.count >= 0);
}

function parseSampleErrors(value: ImportLogRow["sample_errors"]): Array<{ label: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (entry && typeof entry === "object") {
        const row = (entry as { row?: unknown }).row;
        const errors = (entry as { errors?: unknown }).errors;
        const errorsText = Array.isArray(errors)
          ? errors.map((err) => String(err)).join(", ")
          : typeof errors === "string"
            ? errors
            : "Unknown error";
        if (row != null) {
          return { label: `Row ${row}: ${errorsText}` };
        }
        return { label: errorsText };
      }
      if (typeof entry === "string") {
        return { label: entry };
      }
      return null;
    })
    .filter((entry): entry is { label: string } => !!entry && !!entry.label);
}

export function ImportLogsPanel({ tournamentId }: Props) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["import-logs", tournamentId],
    enabled: IMPORT_LOGS_ENABLED && Boolean(tournamentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_logs")
        .select(
          "id, imported_at, filename, sheet_name, header_row, total_rows, accepted_rows, skipped_rows, top_reasons, sample_errors"
        )
        .eq("tournament_id", tournamentId)
        .order("imported_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return data ?? [];
    }
  });

  useEffect(() => {
    if (!IMPORT_LOGS_ENABLED || isLoading || !data) return;
    console.log(`[import.log] fetch count=${data.length}`);
  }, [data, isLoading]);

  if (!IMPORT_LOGS_ENABLED) {
    return null;
  }

  return (
    <Card className="mb-6" data-testid="import-logs-panel">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Import History</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading import history…</p>}
        {isError && (
          <p className="text-sm text-destructive">
            Unable to load import history: {error instanceof Error ? error.message : "Unknown error"}
          </p>
        )}
        {!isLoading && !isError && (!data || data.length === 0) && (
          <p className="text-sm text-muted-foreground">No import history yet.</p>
        )}
        {!isLoading && !isError && data && data.length > 0 && (
          <div className="space-y-4">
            {data.map((log) => {
              const reasons = parseReasons(log.top_reasons).slice(0, MAX_REASONS);
              const samples = parseSampleErrors(log.sample_errors).slice(0, MAX_SAMPLE_ERRORS);

              return (
                <div key={log.id} className="space-y-2" data-testid="import-log-row">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">
                      {new Date(log.imported_at).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short"
                      })}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {log.accepted_rows ?? 0}/{log.total_rows ?? 0} rows accepted
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {log.filename ?? "Unnamed file"}
                    {log.sheet_name ? ` • Sheet: ${log.sheet_name}` : ""}
                    {log.header_row ? ` • Header row: ${log.header_row}` : ""}
                  </div>

                  {reasons.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {reasons.map((reason, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {reason.reason}: {reason.count}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {samples.length > 0 && (
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <Separator />
                      {samples.map((sample, idx) => (
                        <p key={idx}>{sample.label}</p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
