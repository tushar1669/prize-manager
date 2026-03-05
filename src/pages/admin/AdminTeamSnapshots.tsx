import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Loader2, AlertCircle, RefreshCw } from "lucide-react";

interface MissingSnapshot {
  tournament_id: string;
  tournament_title: string;
  published_version: number;
}

type RowStatus =
  | { state: "idle" }
  | { state: "running" }
  | { state: "success"; rows_inserted: number; already_backfilled: boolean }
  | { state: "error"; message: string };

export default function AdminTeamSnapshots() {
  const queryClient = useQueryClient();
  const [rowStatuses, setRowStatuses] = useState<Record<string, RowStatus>>({});
  const [bulkRunning, setBulkRunning] = useState(false);

  const { data: missing, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-missing-team-snapshots"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("detect_missing_team_snapshots");
      if (error) throw error;
      return (data ?? []) as MissingSnapshot[];
    },
  });

  const backfillOne = useCallback(async (tournamentId: string): Promise<RowStatus> => {
    setRowStatuses((prev) => ({ ...prev, [tournamentId]: { state: "running" } }));
    try {
      const { data, error } = await supabase.functions.invoke("backfillTeamAllocations", {
        body: { tournament_id: tournamentId },
      });
      if (error) throw error;
      const status: RowStatus = {
        state: "success",
        rows_inserted: data?.rows_inserted ?? 0,
        already_backfilled: data?.already_backfilled ?? false,
      };
      setRowStatuses((prev) => ({ ...prev, [tournamentId]: status }));
      return status;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const status: RowStatus = { state: "error", message };
      setRowStatuses((prev) => ({ ...prev, [tournamentId]: status }));
      return status;
    }
  }, []);

  const backfillAll = useCallback(async () => {
    if (!missing?.length) return;
    setBulkRunning(true);
    for (const row of missing) {
      await backfillOne(row.tournament_id);
    }
    setBulkRunning(false);
    queryClient.invalidateQueries({ queryKey: ["admin-missing-team-snapshots"] });
  }, [missing, backfillOne, queryClient]);

  const handleBackfillOne = useCallback(
    async (tournamentId: string) => {
      await backfillOne(tournamentId);
      queryClient.invalidateQueries({ queryKey: ["admin-missing-team-snapshots"] });
    },
    [backfillOne, queryClient]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load: {(error as Error).message}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Team Snapshots</CardTitle>
          <CardDescription>
            Published tournaments with active team prize groups but no persisted team_allocations for the published version.
          </CardDescription>
        </CardHeader>
      </Card>

      {!missing?.length ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-green-500">
            <CheckCircle2 className="h-5 w-5" />
            <span>All published tournaments have team snapshots ✅</span>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">{missing.length} tournament(s) missing snapshots</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={bulkRunning}>
                <RefreshCw className="mr-1 h-4 w-4" />
                Refresh
              </Button>
              <Button size="sm" onClick={backfillAll} disabled={bulkRunning}>
                {bulkRunning && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Backfill All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tournament</TableHead>
                  <TableHead className="w-[140px]">Published Version</TableHead>
                  <TableHead className="w-[120px]">Action</TableHead>
                  <TableHead className="w-[220px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {missing.map((row) => {
                  const status = rowStatuses[row.tournament_id] ?? { state: "idle" };
                  return (
                    <TableRow key={row.tournament_id}>
                      <TableCell className="font-medium">{row.tournament_title}</TableCell>
                      <TableCell>v{row.published_version}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={status.state === "running" || bulkRunning}
                          onClick={() => handleBackfillOne(row.tournament_id)}
                        >
                          {status.state === "running" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          Backfill
                        </Button>
                      </TableCell>
                      <TableCell>
                        {status.state === "success" && (
                          <Badge variant="default" className="bg-green-600">
                            {status.already_backfilled
                              ? "Already backfilled"
                              : `Done — ${status.rows_inserted} rows`}
                          </Badge>
                        )}
                        {status.state === "error" && (
                          <Badge variant="destructive">{status.message}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
