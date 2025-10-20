import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePapaParser } from "@/hooks/usePapaParser";
import { ColumnMappingDialog } from "@/components/ColumnMappingDialog";
import { playerImportSchema, PlayerImportRow } from "@/lib/validations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ParsedPlayer extends PlayerImportRow {
  _originalIndex: number;
}

export default function PlayerImport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { parseFile } = usePapaParser();

  const [parsedData, setParsedData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappedPlayers, setMappedPlayers] = useState<ParsedPlayer[]>([]);
  const [validationErrors, setValidationErrors] = useState<{ row: number; errors: string[] }[]>([]);
  const [duplicates, setDuplicates] = useState<{ row: number; duplicate: string }[]>([]);
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [isParsing, setIsParsing] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setIsParsing(true);

    try {
      const { data, headers: csvHeaders } = await parseFile(selectedFile);
      setParsedData(data);
      setHeaders(csvHeaders);
      
      // Try auto-mapping; if both required fields found, skip dialog
      const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
      const autoMapping: Record<string, string> = {};
      
      csvHeaders.forEach(h => {
        const normalized = norm(h);
        if (!autoMapping.rank && (normalized === 'rank' || normalized.includes('pos') || normalized === 'position')) {
          autoMapping.rank = h;
        }
        if (!autoMapping.name && (normalized === 'name' || normalized.includes('player'))) {
          autoMapping.name = h;
        }
        // Auto-map optional fields too
        if (!autoMapping.rating && (normalized === 'rating' || normalized === 'elo')) {
          autoMapping.rating = h;
        }
        if (!autoMapping.dob && (normalized === 'dob' || normalized.includes('birth'))) {
          autoMapping.dob = h;
        }
        if (!autoMapping.gender && (normalized === 'gender' || normalized === 'sex')) {
          autoMapping.gender = h;
        }
        if (!autoMapping.state && (normalized === 'state' || normalized === 'province')) {
          autoMapping.state = h;
        }
        if (!autoMapping.city && (normalized === 'city' || normalized === 'town')) {
          autoMapping.city = h;
        }
      });
      
      if (autoMapping.rank && autoMapping.name) {
        handleMappingConfirm(autoMapping);
        toast.info('Columns auto-mapped successfully');
      } else {
        setShowMappingDialog(true);
      }
    } catch (error) {
      console.error('[parseFile]', error);
      toast.error("Failed to parse file. Upload CSV or Excel (.xls/.xlsx).");
    } finally {
      setIsParsing(false);
    }
  };

  const handleMappingConfirm = async (mapping: Record<string, string>) => {
    setShowMappingDialog(false);

    // Probe which optional columns exist
    const columnExists = async (column: string) => {
      const { error } = await supabase
        .from('players')
        .select(column)
        .limit(0)
        .maybeSingle();
      return !error;
    };

    const getExistingOptionalColumns = async () => {
      const optional = ['rating', 'dob', 'gender', 'state', 'city'];
      const checks = await Promise.all(optional.map(async c => [c, await columnExists(c)] as const));
      return new Set(checks.filter(([,ok]) => ok).map(([c]) => c));
    };

    const existingColumns = await getExistingOptionalColumns();

    const mapped: ParsedPlayer[] = parsedData.map((row, idx) => {
      const player: Record<string, any> = { _originalIndex: idx + 1 };
      
      Object.keys(mapping).forEach(fieldKey => {
        const csvColumn = mapping[fieldKey];
        let value = row[csvColumn];

        if (fieldKey === 'rank' || fieldKey === 'rating') {
          value = value ? Number(value) : (fieldKey === 'rank' ? 0 : null);
        } else if (fieldKey === "dob" && value != null && value !== "") {
          if (typeof value === "number") {
            // Excel serial date → JS date
            const jsDate = new Date(Math.round((value - 25569) * 86400 * 1000));
            value = isNaN(jsDate.getTime()) ? null : jsDate.toISOString().slice(0, 10);
          } else {
            const s = String(value).trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
              value = s;
            } else {
              const parsed = new Date(s);
              value = isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
            }
          }
        }

        // Only include column if it exists in the table
        if (fieldKey === 'rank' || fieldKey === 'name' || existingColumns.has(fieldKey)) {
          player[fieldKey] = value;
        }
      });

      return player as ParsedPlayer;
    });

    const errors: { row: number; errors: string[] }[] = [];
    const validPlayers: ParsedPlayer[] = [];

    mapped.forEach(player => {
      const result = playerImportSchema.safeParse(player);
      if (result.success) {
        validPlayers.push(player);
      } else {
        errors.push({
          row: player._originalIndex,
          errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        });
      }
    });

    setValidationErrors(errors);

    const dupes: { row: number; duplicate: string }[] = [];
    const seen = new Map<string, number>();

    validPlayers.forEach(player => {
      if (player.name && player.dob) {
        const key = `${player.name.toLowerCase().trim()}|${player.dob}`;
        const existing = seen.get(key);
        if (existing) {
          dupes.push({ row: player._originalIndex, duplicate: `Duplicate of row ${existing}` });
        } else {
          seen.set(key, player._originalIndex);
        }
      }
    });

    setDuplicates(dupes);
    setMappedPlayers(validPlayers);

    if (errors.length === 0 && dupes.length === 0) {
      toast.success(`${validPlayers.length} players ready to import`);
    }
  };

  const importPlayersMutation = useMutation({
    mutationFn: async (players: ParsedPlayer[]) => {
      const rowsToInsert = players.map(p => {
        const row: any = {
          tournament_id: id,
          rank: p.rank,
          name: p.name,
          tags_json: {},
          warnings_json: {}
        };
        
        // Only include fields that exist in parsed player
        if ('rating' in p) row.rating = p.rating || 0;
        if ('dob' in p) row.dob = p.dob || null;
        if ('gender' in p) row.gender = p.gender || null;
        if ('state' in p) row.state = p.state || null;
        if ('city' in p) row.city = p.city || null;
        
        return row;
      });

      const { data, error } = await supabase
        .from('players')
        .insert(rowsToInsert)
        .select('id');

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`${data.length} players imported successfully`);
      if (!id) {
        toast.error('Tournament ID missing');
        navigate('/dashboard');
        return;
      }
      navigate(`/t/${id}/review`);
    },
    onError: (error: any) => {
      console.error('[importPlayers]', error);
      toast.error(error.message?.includes('row-level security') 
        ? "Permission denied" 
        : `Import failed: ${error.message}`);
    }
  });

  const hasData = mappedPlayers.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      
      <div className="container mx-auto px-6 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Import Players</h1>
          <p className="text-muted-foreground">Upload Excel (XLS/XLSX) file with player data</p>
        </div>

        {!hasData ? (
          <Card>
            <CardHeader><CardTitle>Upload Excel File</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
                <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Upload Player Data</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Excel file with columns: rank, name, rating, DOB, gender, state, city
                </p>
                <input
                  type="file"
                  accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="csv-upload"
                  disabled={isParsing}
                />
                <label htmlFor="csv-upload">
                  <Button asChild disabled={isParsing}>
                    <span>{isParsing ? "Parsing..." : "Select Excel File"}</span>
                  </Button>
                </label>
              </div>
              <Alert>
                <FileText className="h-4 w-4" />
                <AlertDescription>
                  <strong>File Format:</strong> Ensure your Excel file has headers and at least 'rank' and 'name' columns.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {validationErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>{validationErrors.length} validation errors</strong>
                </AlertDescription>
              </Alert>
            )}
            {validationErrors.length === 0 && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>All {mappedPlayers.length} players validated</AlertDescription>
              </Alert>
            )}
            <Card>
              <CardHeader><CardTitle>Preview ({mappedPlayers.length} players)</CardTitle></CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rank</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Rating</TableHead>
                        <TableHead>DOB</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mappedPlayers.slice(0, 10).map((player, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{player.rank}</TableCell>
                          <TableCell>{player.name}</TableCell>
                          <TableCell>{player.rating || 0}</TableCell>
                          <TableCell>{player.dob || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => {
                if (!id) {
                  toast.error('Tournament ID missing');
                  navigate('/dashboard');
                  return;
                }
                navigate(`/t/${id}/setup?tab=prizes`);
              }}>
                Back
              </Button>
              <Button
                onClick={() => importPlayersMutation.mutate(mappedPlayers)}
                disabled={validationErrors.length > 0 || importPlayersMutation.isPending}
              >
                {importPlayersMutation.isPending ? "Importing..." : `Import ${mappedPlayers.length} Players`}
              </Button>
            </div>
          </div>
        )}
      </div>

      <ColumnMappingDialog
        open={showMappingDialog}
        onOpenChange={setShowMappingDialog}
        detectedColumns={headers}
        onConfirm={handleMappingConfirm}
      />
    </div>
  );
}
