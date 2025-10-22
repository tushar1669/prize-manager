import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppNav } from "@/components/AppNav";
import { BackBar } from "@/components/BackBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePapaParser } from "@/hooks/usePapaParser";
import { ColumnMappingDialog } from "@/components/ColumnMappingDialog";
import { playerImportSchema, PlayerImportRow } from "@/lib/validations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import * as XLSX from "xlsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

interface ParsedPlayer extends PlayerImportRow {
  _originalIndex: number;
}

// Helper functions for smart retry
const pick = (obj: Record<string, any>, keys: string[]) =>
  keys.reduce((acc, k) => { if (k in obj) acc[k] = obj[k]; return acc; }, {} as Record<string, any>);

// Parses PostgREST/Postgres error messages to extract an unknown column name
const extractUnknownColumn = (msg: string): string | null => {
  if (!msg) return null;

  // Known variants seen from PostgREST/Postgres
  const patterns = [
    /column\s+"?([a-zA-Z0-9_]+)"?\s+of\s+relation\s+"players"/i,
    /No column '([a-zA-Z0-9_]+)'/i,
    /column\s+"?([a-zA-Z0-9_]+)"?\s+does\s+not\s+exist/i,

    // NEW: Supabase "schema cache" variant:
    // e.g. "Could not find the 'city' column of 'players' in the schema cache"
    /Could not find the '([a-zA-Z0-9_]+)' column of 'players' in the schema cache/i,
  ];

  for (const re of patterns) {
    const m = msg.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
};

// Helper: normalize DOB to YYYY-MM-DD
const toISODate = (d: any): string | null => {
  if (!d) return null;
  if (typeof d === 'number') {
    // Excel serial date
    const jsDate = new Date(Math.round((d - 25569) * 86400 * 1000));
    return isNaN(jsDate.getTime()) ? null : jsDate.toISOString().slice(0, 10);
  }
  const t = Date.parse(String(d));
  return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
};

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
  const [parseStatus, setParseStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  // Auth & role for organizer guard
  const { user } = useAuth();
  const { isMaster } = useUserRole();

  // Fetch tournament to check ownership
  const { data: tournament } = useQuery({
    queryKey: ['tournament', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('owner_id')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const isOrganizer = !!isMaster || (tournament && user && tournament.owner_id === user.id);

  const downloadTemplate = () => {
    const headers = ["rank", "name", "rating", "dob", "gender", "state", "city", "club", "disability", "special_notes"];
    const sample = [
      [1, "Aditi Sharma", 1850, "2007-03-17", "F", "MH", "Mumbai", "Mumbai Chess Club", "", ""],
      [2, "Rohan Iyer", 1720, "2005-11-02", "M", "KA", "Bengaluru", "Karnataka CA", "Hearing", "Front row seat"],
      [3, "Sia Verma", 1500, "2010-08-25", "F", "DL", "New Delhi", "", "", "Vegetarian lunch"],
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
    (ws as any)["!cols"] = [
      { wch: 6 },  // rank
      { wch: 22 }, // name
      { wch: 8 },  // rating
      { wch: 12 }, // dob
      { wch: 8 },  // gender
      { wch: 8 },  // state
      { wch: 16 }, // city
      { wch: 20 }, // club
      { wch: 12 }, // disability
      { wch: 24 }, // special_notes
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Players");
    XLSX.writeFile(wb, "players_template.xlsx");
    toast.success("Template downloaded");
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setIsParsing(true);

    try {
      const { data, headers: csvHeaders } = await parseFile(selectedFile);
      setParsedData(data);
      setHeaders(csvHeaders);
      
      // Try auto-mapping; if both required fields found, skip dialog
      const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, '_');
      const autoMapping: Record<string, string> = {};
      
      // Comprehensive synonym lists matching ColumnMappingDialog
      const synonyms: Record<string, string[]> = {
        rank: ['rank', 'sr_no', 's_no', 'sno', 'seed', 'seeding', 'pos', 'position'],
        name: ['name', 'player_name', 'full_name', 'player'],
        rating: ['rating', 'elo', 'rtg'],
        dob: ['dob', 'date_of_birth', 'birth_date', 'birthdate'],
        gender: ['gender', 'sex'],
        state: ['state', 'province'],
        city: ['city', 'town'],
        club: ['club', 'chess_club'],
        disability: ['disability', 'special_needs'],
        special_notes: ['special_notes', 'notes', 'remarks', 'comments']
      };
      
      csvHeaders.forEach(h => {
        const normalized = norm(h);
        for (const [field, aliases] of Object.entries(synonyms)) {
          if (!autoMapping[field] && aliases.includes(normalized)) {
            autoMapping[field] = h;
            break;
          }
        }
      });
      
      if (autoMapping.rank && autoMapping.name) {
        handleMappingConfirm(autoMapping);
        toast.info('Columns auto-mapped successfully');
      } else {
        setShowMappingDialog(true);
      }
      setParseStatus('ok');
    } catch (error) {
      console.error('[parseFile]', error);
      toast.error("Failed to parse file. Please upload an Excel file (.xls or .xlsx).");
      setParseStatus('error');
    } finally {
      setIsParsing(false);
    }
  };

  const handleMappingConfirm = async (mapping: Record<string, string>) => {
    setShowMappingDialog(false);

    const mapped: ParsedPlayer[] = parsedData.map((row, idx) => {
      const player: Record<string, any> = { _originalIndex: idx + 1 };

      Object.keys(mapping).forEach((fieldKey) => {
        const col = mapping[fieldKey];
        let value = row[col];

        if (fieldKey === 'rank' || fieldKey === 'rating') {
          value = value ? Number(value) : (fieldKey === 'rank' ? 0 : null);
        } else if (fieldKey === 'dob' && value != null && value !== '') {
          if (typeof value === 'number') {
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
        } else if (typeof value === 'string') {
          // Trim all string fields and convert empty strings to null
          value = value.trim() || null;
        }

        // Always carry what the mapping gave us; we'll strip unknown fields at insert time.
        player[fieldKey] = value;
      });

      return player as ParsedPlayer;
    });

    // Normalize DOB to strict YYYY-MM-DD
    mapped.forEach(player => {
      if (player.dob) {
        const normalized = toISODate(player.dob);
        if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
          // Will be caught in validation below
          player.dob = null;
        } else {
          player.dob = normalized;
        }
      }
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
    
    // Filter out invalid rows before setting
    const valid = validPlayers.filter(p => Number(p.rank) > 0 && String(p.name || '').trim().length > 0);
    
    if (valid.length === 0) {
      console.warn('[import] No valid rows after mapping. Sample of first row:', mapped[0]);
      toast.error('No valid rows to import. Check that "rank" and "name" columns are present and non-empty.');
      setMappedPlayers([]);
      return;
    }
    
    setMappedPlayers(valid);

    if (errors.length === 0 && dupes.length === 0) {
      toast.success(`${valid.length} players ready to import`);
      setParseStatus('ok');
    } else {
      setParseStatus('error');
    }
  };

  const importPlayersMutation = useMutation({
    mutationFn: async (players: ParsedPlayer[]) => {
      // Start from the union of keys we actually have in ParsedPlayer objects
      const extraKeys = new Set<string>();
      players.forEach(p => Object.keys(p).forEach(k => extraKeys.add(k)));

      // Always required + whatever else we saw (minus our internal key)
      let fields = Array.from(extraKeys).filter(k => k !== '_originalIndex');
      if (!fields.includes('rank')) fields.push('rank');
      if (!fields.includes('name')) fields.push('name');

      // Build row payload factory
      const buildRows = (fieldList: string[]) =>
        players.map(p => {
          const row: any = pick(p, fieldList);
          // Required framework columns:
          row.tournament_id = id;
          row.tags_json = {};
          row.warnings_json = {};
          // Defaults
          if ('rating' in row && (row.rating == null || row.rating === '')) row.rating = 0;
          if ('dob' in row && row.dob === '') row.dob = null;
          if ('gender' in row && row.gender === '') row.gender = null;
          if ('state' in row && row.state === '') row.state = null;
          if ('city' in row && row.city === '') row.city = null;
          return row;
        });

      // Try up to 4 times, stripping unknown columns as needed
      let attempts = 0;
      let lastErr: any = null;
      let currentFields = [...fields];
      while (attempts < 4) {
        const payload = buildRows(currentFields);
        const { data, error } = await supabase.from('players').insert(payload).select('id');

        if (!error) return data;

        const unknown = extractUnknownColumn(error?.message || '');
        if (unknown && currentFields.includes(unknown)) {
          console.warn(`[import] Removing unknown column "${unknown}" and retrying insert`);
          currentFields = currentFields.filter(f => f !== unknown);
          attempts++;
          continue;
        }
        lastErr = error;
        break;
      }

      throw lastErr || new Error('Insert failed after retries');
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
    onError: (err: any) => {
      const msg = err?.message || 'Import failed';
      console.error('[players import] error', err);
      toast.error(msg);
    }
  });

  const hasData = mappedPlayers.length > 0;
  const canProceed = parseStatus === 'ok' && mappedPlayers.length > 0 && validationErrors.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <BackBar label="Back to Setup" to={`/t/${id}/setup`} />
      <AppNav />
      
      <div className="container mx-auto px-6 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Import Players</h1>
          <p className="text-muted-foreground">Upload Excel (XLS/XLSX) file with player data. Required: rank, name. Optional: rating, dob, gender, state, city, disability, special_notes.</p>
        </div>

        {!hasData ? (
          <Card>
            <CardHeader><CardTitle>Upload Excel File</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {isOrganizer ? (
                <>
                  <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
                    <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">Upload Player Data</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Excel file with columns: rank, name, rating, DOB, gender, state, city
                    </p>
                    <div className="flex items-center justify-center gap-3 mb-3">
                      <Button variant="outline" onClick={downloadTemplate}>
                        Download Excel Template
                      </Button>
                    </div>
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
                    <p className="text-sm text-muted-foreground mt-4">
                      Required columns: <strong>rank</strong>, <strong>name</strong>. Optional: rating, dob (YYYY-MM-DD or Excel date), gender, state, city, disability, special_notes.
                    </p>
                  </div>
                  <Alert>
                    <FileText className="h-4 w-4" />
                    <AlertDescription>
                      <strong>File Format:</strong> Ensure your Excel file has headers and at least 'rank' and 'name' columns.
                    </AlertDescription>
                  </Alert>
                </>
              ) : (
                <div className="text-sm text-muted-foreground p-8 text-center">
                  You have read-only access to this tournament. Please contact the organizer to import players.
                </div>
              )}
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
            
            {/* Persistent error panel */}
            {parseStatus === 'error' && (validationErrors.length > 0 || duplicates.length > 0) && (
              <div className="mb-6 p-4 bg-destructive/10 border border-destructive rounded-lg space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-destructive mb-2">
                      Import Errors Found
                    </h4>
                    <div className="text-sm space-y-1 max-h-32 overflow-y-auto">
                      {validationErrors.slice(0, 5).map((err, idx) => (
                        <p key={idx}>
                          <strong>Row {err.row}:</strong> {err.errors.join('; ')}
                        </p>
                      ))}
                      {validationErrors.length > 5 && (
                        <p className="text-muted-foreground">
                          ...and {validationErrors.length - 5} more errors
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const blob = new Blob(
                      [JSON.stringify({ validationErrors, duplicates }, null, 2)],
                      { type: 'application/json' }
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `import-errors-${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download Error Log (JSON)
                </Button>
              </div>
            )}
            
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
                disabled={!canProceed || importPlayersMutation.isPending}
              >
                {importPlayersMutation.isPending ? "Importing..." : `Next: Review & Allocate`}
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
