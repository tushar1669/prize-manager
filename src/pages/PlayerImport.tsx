/**
 * PlayerImport: Excel upload with auto-mapping and validation
 * 
 * Column mapping note: While auto-mapping handles header name variations 
 * (e.g., "Rank" vs "rank"), data must be in semantically correct columns.
 * Swapped columns (e.g., city data in disability column) will cause validation errors.
 */
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppNav } from "@/components/AppNav";
import { BackBar } from "@/components/BackBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useExcelParser } from "@/hooks/useExcelParser";
import { ColumnMappingDialog } from "@/components/ColumnMappingDialog";
import { playerImportSchema, PlayerImportRow } from "@/lib/validations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ErrorPanel from "@/components/ui/ErrorPanel";
import { useErrorPanel } from "@/hooks/useErrorPanel";
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
import { useDirty } from "@/contexts/DirtyContext";
import { makeKey, getDraft, clearDraft, formatAge } from '@/utils/autosave';
import { useAutosaveEffect } from '@/hooks/useAutosaveEffect';
import { downloadPlayersTemplateXlsx, downloadErrorXlsx } from '@/utils/excel';
import { 
  HEADER_ALIASES, 
  generatePlayerKey, 
  normalizeName,
  normalizeDobForImport,
  ImportConflict,
  ImportConflictType 
} from '@/utils/importSchema';

interface ParsedPlayer extends PlayerImportRow {
  _originalIndex: number;
  fide_id?: string | null;
  dob_raw?: string | null;
  _dobInferred?: boolean;
  _dobInferredReason?: string;
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

// Helper: normalize DOB to YYYY-MM-DD, handling partial dates
const toISODate = (d: any): { dob: string | null; dob_raw: string | null; inferred: boolean; inferredReason?: string } => {
  if (!d) return { dob: null, dob_raw: null, inferred: false };
  
  // Handle Excel serial dates
  if (typeof d === 'number') {
    const jsDate = new Date(Math.round((d - 25569) * 86400 * 1000));
    if (isNaN(jsDate.getTime())) return { dob: null, dob_raw: String(d), inferred: false };
    const normalized = jsDate.toISOString().slice(0, 10);
    return { dob: normalized, dob_raw: normalized, inferred: false };
  }
  
  // Use centralized normalization
  return normalizeDobForImport(String(d));
};

export default function PlayerImport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { parseFile } = useExcelParser();
  const { error, showError, clearError } = useErrorPanel();
  const { setDirty, resetDirty } = useDirty();

  const [parsedData, setParsedData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappedPlayers, setMappedPlayers] = useState<ParsedPlayer[]>([]);
  const [validationErrors, setValidationErrors] = useState<{ row: number; errors: string[] }[]>([]);
  const [duplicates, setDuplicates] = useState<{ row: number; duplicate: string }[]>([]);
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [parseError, setParseError] = useState<string | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(true);

  // NEW: DB players for conflict detection
  const [dbPlayers, setDbPlayers] = useState<Array<{
    id: string;
    name: string;
    dob?: string | null;
    rating?: number | null;
    fide_id?: string | null;
  }>>([]);

  // NEW: Conflicts (separate from duplicates)
  const [conflicts, setConflicts] = useState<ImportConflict[]>([]);

  // NEW: Autosave
  const importDraftKey = makeKey(`t:${id}:import`);
  const [importRestore, setImportRestore] = useState<null | { 
    data: { 
      mappedPlayers: ParsedPlayer[]; 
      conflicts: ImportConflict[];
      replaceExisting: boolean;
    }; 
    ageMs: number 
  }>(null);

  // NEW: Conflict resolution tracking
  const [resolvedConflicts, setResolvedConflicts] = useState<Set<number>>(new Set());

  // Track dirty state when mapped players exist
  useEffect(() => {
    setDirty('import', mappedPlayers.length > 0);
  }, [mappedPlayers.length, setDirty]);

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
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Tournament not found');
      return data;
    },
    enabled: !!id,
  });

  const isOrganizer = !!isMaster || (tournament && user && tournament.owner_id === user.id);

  // NEW: Fetch existing players for duplicate/conflict detection
  const { data: existingPlayers } = useQuery({
    queryKey: ['players', id],
    queryFn: async () => {
      // Try to select fide_id, but handle gracefully if column doesn't exist
      const { data, error } = await supabase
        .from('players')
        .select('id, name, dob, rating')
        .eq('tournament_id', id);
      if (error) throw error;
      return (data || []).map(p => ({ ...p, fide_id: null }));
    },
    enabled: !!id
  });

  useEffect(() => {
    if (existingPlayers) {
      console.log('[import] Loaded', existingPlayers.length, 'existing players');
      setDbPlayers(existingPlayers);
    }
  }, [existingPlayers]);

  // NEW: Check for autosave draft on mount
  useEffect(() => {
    if (mappedPlayers.length > 0) return; // Don't overwrite existing work
    const draft = getDraft<{ 
      mappedPlayers: ParsedPlayer[]; 
      conflicts: ImportConflict[];
      replaceExisting: boolean;
    }>(importDraftKey, 1);
    
    if (draft) {
      console.log('[import] Draft found:', draft.data.mappedPlayers.length, 'players');
      setImportRestore(draft);
    }
  }, [id, importDraftKey, mappedPlayers.length]);

  // NEW: Autosave mapped data + conflicts + checkbox state
  useAutosaveEffect({
    key: importDraftKey,
    data: { mappedPlayers, conflicts, replaceExisting },
    enabled: mappedPlayers.length > 0,
    debounceMs: 800,
    version: 1
  });

  const downloadTemplate = () => {
    downloadPlayersTemplateXlsx();
    toast.success('Excel template downloaded');
  };

  const handleResetImport = () => {
    // Clear all working state so we can start fresh
    setParsedData([]);
    setHeaders([]);
    setMappedPlayers([]);
    setValidationErrors([]);
    setDuplicates([]);
    setParseError(null);
    setParseStatus('idle');
    setShowMappingDialog(false);
    setIsParsing(false);
    resetDirty('import');

    // Also clear file input so the same file can be picked again
    const input = document.getElementById('players-file-input') as HTMLInputElement | null;
    if (input) input.value = '';
    
    toast.info('Import reset — you can choose a file again.');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isParsing) {
      toast.info('Already processing a file…');
      return;
    }
    
    const selectedFile = e.target.files?.[0];
    console.log('[import] file selected:', selectedFile?.name, selectedFile?.type, selectedFile?.size);
    
    if (!selectedFile) {
      toast.error('No file selected');
      return;
    }
    
    // Clear previous run's state so UI can't show stale errors/results
    setParseError(null);
    setValidationErrors([]);
    setDuplicates([]);
    setMappedPlayers([]);
    setParseStatus('idle');
    
    toast.info(`Uploading ${selectedFile.name}...`);

    setIsParsing(true);

    try {
      const { data, headers: csvHeaders } = await parseFile(selectedFile);
      setParsedData(data);
      setHeaders(csvHeaders);
      setParseError(null); // Clear any previous error
      
      // Try auto-mapping; if both required fields found, skip dialog
      const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, '_');
      const autoMapping: Record<string, string> = {};
      
      // Use centralized aliases
      const synonyms = HEADER_ALIASES;
      
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
      // Don't set parseStatus('ok') here - wait for validation in handleMappingConfirm
    } catch (error) {
      console.error('[parseFile]', error);
      const errMsg = error instanceof Error ? error.message : "Failed to parse file. Please upload an Excel file (.xls or .xlsx).";
      setParseError(errMsg);
      toast.error(errMsg);
      setParseStatus('error');
    } finally {
      setIsParsing(false);
      // Reset file input to allow re-uploading same filename
      if (e?.target && 'value' in e.target) {
        (e.target as HTMLInputElement).value = '';
      }
    }
  };

  const handleMappingConfirm = async (mapping: Record<string, string>) => {
    setShowMappingDialog(false);

    // Map data with fide_id support
    const mapped: ParsedPlayer[] = parsedData.map((row, idx) => {
      const player: Record<string, any> = { _originalIndex: idx + 1 };

      Object.keys(mapping).forEach((fieldKey) => {
        const col = mapping[fieldKey];
        let value = row[col];

        if (fieldKey === 'rank' || fieldKey === 'rating') {
          value = value ? Number(value) : (fieldKey === 'rank' ? 0 : null);
        } else if (fieldKey === 'dob' && value != null && value !== '') {
          const result = toISODate(value);
          player.dob = result.dob;
          player.dob_raw = result.dob_raw;
          player._dobInferred = result.inferred;
          player._dobInferredReason = result.inferredReason;
          return; // Skip setting value below since we handled it
        } else if (fieldKey === 'fide_id' && value != null) {
          // NEW: Normalize FIDE ID (trim, convert to string)
          value = String(value).trim() || null;
        } else if (typeof value === 'string') {
          value = value.trim() || null;
        }

        player[fieldKey] = value;
      });

      return player as ParsedPlayer;
    });

    // Validate
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

    // NEW: Enhanced duplicate detection (within file + DB conflicts)
    const newDupes: { row: number; duplicate: string }[] = [];
    const newConflicts: ImportConflict[] = [];
    const seenInFile = new Map<string, number>();

    validPlayers.forEach(player => {
      if (!player.name) return; // Skip if no name
      
      const key = generatePlayerKey(player as { name: string; dob?: string | null; fide_id?: string | null });
      
      // Check within file
      const existingRow = seenInFile.get(key);
      if (existingRow) {
        newDupes.push({ 
          row: player._originalIndex, 
          duplicate: `Duplicate of row ${existingRow}` 
        });
        newConflicts.push({
          row: player._originalIndex,
          type: 'duplicate_in_file',
          message: `Duplicate of row ${existingRow} (same ${player.fide_id ? 'FIDE ID' : 'name+DOB'})`
        });
      } else {
        seenInFile.set(key, player._originalIndex);
      }
      
      // Check against DB players
      if (dbPlayers.length > 0 && !existingRow) {
        const dbMatch = dbPlayers.find(db => {
          // Match by FIDE ID first
          if (player.fide_id && db.fide_id) {
            return player.fide_id === db.fide_id;
          }
          // Fallback to name+DOB
          if (player.name && player.dob && db.name && db.dob) {
            return normalizeName(player.name) === normalizeName(db.name) && 
                   player.dob === db.dob;
          }
          return false;
        });
        
        if (dbMatch) {
          const dobMismatch = player.dob && dbMatch.dob && player.dob !== dbMatch.dob;
          const ratingMismatch = player.rating != null && dbMatch.rating != null && 
                                Math.abs(player.rating - dbMatch.rating) > 100;
          
          if (dobMismatch) {
            newConflicts.push({
              row: player._originalIndex,
              playerId: dbMatch.id,
              type: 'conflict_different_dob',
              message: `Player exists with different DOB: existing ${dbMatch.dob}, new ${player.dob}`,
              existingPlayer: dbMatch
            });
          } else if (ratingMismatch) {
            newConflicts.push({
              row: player._originalIndex,
              playerId: dbMatch.id,
              type: 'conflict_different_rating',
              message: `Player exists with different rating: existing ${dbMatch.rating}, new ${player.rating}`,
              existingPlayer: dbMatch
            });
          } else {
            newConflicts.push({
              row: player._originalIndex,
              playerId: dbMatch.id,
              type: 'already_exists',
              message: 'Player already exists in tournament',
              existingPlayer: dbMatch
            });
          }
        }
      }
    });

    setDuplicates(newDupes);
    setConflicts(newConflicts);
    
    console.log('[import] Conflicts detected:', newConflicts.length);
    
    // Filter out invalid rows before setting
    const valid = validPlayers.filter(p => Number(p.rank) > 0 && String(p.name || '').trim().length > 0);
    
    // Check for duplicate ranks (hard error)
    const rankMap = new Map<number, number[]>();
    valid.forEach(player => {
      const rank = Number(player.rank);
      if (rank > 0) {
        if (!rankMap.has(rank)) rankMap.set(rank, []);
        rankMap.get(rank)!.push(player._originalIndex);
      }
    });

    const duplicateRanks: string[] = [];
    rankMap.forEach((rows, rank) => {
      if (rows.length > 1) {
        duplicateRanks.push(`Rank ${rank} at rows ${rows.join(', ')}`);
      }
    });

    if (duplicateRanks.length > 0) {
      const msg = 'Duplicate ranks found: ' + duplicateRanks.join('; ');
      console.log('[import] duplicate ranks', duplicateRanks);
      setParseError(msg);
      setParseStatus('error');
      showError({
        title: "Duplicate ranks detected",
        message: "Each player must have a unique rank.",
        hint: msg
      });
      toast.error('Duplicate ranks detected. Each player must have a unique rank.', { duration: 6000 });
      setMappedPlayers([]);
      return;
    }
    
    if (valid.length === 0) {
      console.warn('[import] No valid rows after mapping');
      setParseStatus('error');
      setParseError('No valid rows after mapping. Ensure Rank and Name columns exist.');
      setMappedPlayers([]);
      toast.error('No valid rows found. Check that Rank and Name columns exist.');
      return;
    }
    
    setMappedPlayers(valid);

    // Set parseStatus
    if (errors.length === 0 && newDupes.length === 0) {
      toast.success(`${valid.length} players ready to import`);
      setParseStatus('ok');
    } else {
      setParseStatus('error');
    }
  };

  const importPlayersMutation = useMutation({
    mutationFn: async (players: ParsedPlayer[]) => {
      console.time('[import] batch-insert');
      
      const CHUNK_SIZE = 500;
      const fields = ['rank', 'name', 'rating', 'dob', 'dob_raw', 'gender', 'state', 'city', 'club', 'disability', 'special_notes'];
      
      // Replace logic
      if (replaceExisting) {
        console.log('[import] Deleting existing players');
        const { error: deleteError } = await supabase
          .from('players')
          .delete()
          .eq('tournament_id', id);
        
        if (deleteError) {
          throw new Error(`Failed to clear existing players: ${deleteError.message}`);
        }
      }

      const buildRows = (playerList: ParsedPlayer[]) =>
        playerList.map(p => {
          const picked = pick(p, fields);
          return {
            rank: Number(p.rank), // Required: must be a number
            name: String(p.name || ''), // Required: must be a string
            rating: picked.rating != null ? Number(picked.rating) : null,
            dob: picked.dob || null,
            dob_raw: picked.dob_raw || picked.dob || null,
            gender: picked.gender || null,
            state: picked.state || null,
            city: picked.city || null,
            club: picked.club || null,
            disability: picked.disability || null,
            special_notes: picked.special_notes || null,
            tournament_id: id!,
            tags_json: {},
            warnings_json: {}
          };
        });

      // Chunk insert
      const chunks: ParsedPlayer[][] = [];
      for (let i = 0; i < players.length; i += CHUNK_SIZE) {
        chunks.push(players.slice(i, i + CHUNK_SIZE));
      }

      const results: { 
        success: ParsedPlayer[]; 
        failed: Array<{ player: ParsedPlayer; error: string }> 
      } = { success: [], failed: [] };

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`[import] Chunk ${i + 1}/${chunks.length} (${chunk.length} players)`);
        
        const payload = buildRows(chunk);
        const { data, error } = await supabase.from('players').insert(payload).select('id');

        if (!error) {
          results.success.push(...chunk);
        } else {
          console.warn('[import] Chunk failed, trying individual inserts');
          for (const player of chunk) {
            const singlePayload = buildRows([player]);
            const { error: singleError } = await supabase.from('players').insert(singlePayload);
            
            if (singleError) {
              results.failed.push({ player, error: singleError.message || 'Unknown error' });
            } else {
              results.success.push(player);
            }
          }
        }
      }

      console.timeEnd('[import] batch-insert');
      return results;
    },
    onSuccess: (results) => {
      clearDraft(importDraftKey);
      resetDirty('import');
      
      if (results.failed.length === 0) {
        toast.success(`Imported all ${results.success.length} players`);
        navigate(`/t/${id}/review`);
      } else {
        toast.warning(`Imported ${results.success.length} players. ${results.failed.length} failed.`);
        
        const errorRows = results.failed.map(f => ({
          row: f.player._originalIndex,
          error: f.error,
          rank: f.player.rank,
          name: f.player.name,
          rating: f.player.rating,
          dob: f.player.dob,
          gender: f.player.gender,
          state: f.player.state,
          city: f.player.city,
          club: f.player.club,
          disability: f.player.disability,
          special_notes: f.player.special_notes,
          fide_id: f.player.fide_id,
        }));
        
        downloadErrorXlsx(errorRows);
        toast.info('Error Excel downloaded automatically');
      }
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Import failed');
    }
  });

  // Register Cmd/Ctrl+S
  const { registerOnSave } = useDirty();

  useEffect(() => {
    const unresolved = conflicts.filter(c => !resolvedConflicts.has(c.row)).length;

    const ready =
      mappedPlayers.length > 0 &&
      validationErrors.length === 0 &&
      unresolved === 0 &&
      !importPlayersMutation.isPending;

    if (ready) {
      registerOnSave(async () => {
        console.log('[shortcut] importing players');
        await importPlayersMutation.mutateAsync(mappedPlayers);
      });
    } else {
      registerOnSave(null);
    }

    return () => registerOnSave(null);
  }, [
    mappedPlayers,
    validationErrors,
    conflicts,
    resolvedConflicts,
    importPlayersMutation.isPending,
    registerOnSave,
  ]);

  const clearPlayersMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('Tournament ID missing');
      
      console.log('[import] Clearing all players for tournament', id);
      const { error } = await supabase
        .from('players')
        .delete()
        .eq('tournament_id', id);
      
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      toast.success('Cleared all players for this tournament');
      // Reset UI state
      setParsedData([]);
      setHeaders([]);
      setMappedPlayers([]);
      setValidationErrors([]);
      setDuplicates([]);
      setParseError(null);
      setParseStatus('idle');
    },
    onError: (err: any) => {
      console.error('[import] Clear players error:', err);
      toast.error(`Failed to clear players: ${err.message}`);
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
          <p className="text-muted-foreground">Upload Excel (.xlsx or .xls) file with player data. Required: rank, name. Optional: rating, dob, gender, state, city, club, disability, special_notes, fide_id.</p>
        </div>

        {/* Restore banner */}
        {importRestore && !hasData && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                A saved draft from <strong>{formatAge(importRestore.ageMs)}</strong> with{' '}
                <strong>{importRestore.data.mappedPlayers.length} players</strong> is available.
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMappedPlayers(importRestore.data.mappedPlayers);
                    setConflicts(importRestore.data.conflicts);
                    setReplaceExisting(importRestore.data.replaceExisting);
                    setImportRestore(null);
                    setParseStatus('ok');
                    toast.success('Draft restored');
                  }}
                >
                  Restore draft
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    clearDraft(importDraftKey);
                    setImportRestore(null);
                  }}
                >
                  Discard
                </Button>
              </div>
            </div>
          </div>
        )}

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
                      id="players-file-input"
                      disabled={isParsing}
                    />
                    <div className="flex items-center gap-3">
                      <label htmlFor="players-file-input">
                        <Button asChild disabled={isParsing}>
                          <span>{isParsing ? 'Parsing…' : 'Select Excel File'}</span>
                        </Button>
                      </label>

                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleResetImport}
                        disabled={
                          isParsing ||
                          (
                            parseStatus === 'idle' &&
                            mappedPlayers.length === 0 &&
                            !parseError &&
                            validationErrors.length === 0 &&
                            duplicates.length === 0
                          )
                        }
                        title="Clear the current import and start fresh"
                      >
                        Reset Import
                      </Button>
                    </div>
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
            {/* Conflict resolution UI */}
            {conflicts.length > 0 && (
              <Card className="border-amber-300 bg-amber-50/50">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    Conflicts Detected ({conflicts.filter(c => !resolvedConflicts.has(c.row)).length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-64 overflow-y-auto">
                  {conflicts.filter(c => !resolvedConflicts.has(c.row)).map((conflict, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-start justify-between gap-3 p-3 bg-white border rounded-md"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">Row {conflict.row}</span>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            conflict.type === 'duplicate_in_file' ? 'bg-red-100 text-red-700' :
                            conflict.type === 'already_exists' ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {conflict.type.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{conflict.message}</p>
                        {conflict.existingPlayer && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Existing: {conflict.existingPlayer.name} 
                            {conflict.existingPlayer.dob && ` (${conflict.existingPlayer.dob})`}
                            {conflict.existingPlayer.rating && ` • Rating: ${conflict.existingPlayer.rating}`}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          aria-label={`Keep new player from row ${conflict.row}`}
                          onClick={() => {
                            setResolvedConflicts(prev => new Set(prev).add(conflict.row));
                            toast.info(`Row ${conflict.row}: keeping new player`);
                          }}
                        >
                          Keep New
                        </Button>
                        {conflict.existingPlayer && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            aria-label={`Use existing player for row ${conflict.row}`}
                            onClick={() => {
                              setMappedPlayers(prev => 
                                prev.filter(p => p._originalIndex !== conflict.row)
                              );
                              setResolvedConflicts(prev => new Set(prev).add(conflict.row));
                              toast.info(`Row ${conflict.row}: using existing player`);
                            }}
                          >
                            Use Existing
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          aria-label={`Skip row ${conflict.row}`}
                          onClick={() => {
                            setMappedPlayers(prev => 
                              prev.filter(p => p._originalIndex !== conflict.row)
                            );
                            setResolvedConflicts(prev => new Set(prev).add(conflict.row));
                            toast.info(`Row ${conflict.row}: skipped`);
                          }}
                        >
                          Skip
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

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
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Preview ({mappedPlayers.length} players)</CardTitle>
                  {mappedPlayers.length > 10 && (
                    <button
                      type="button"
                      className="text-sm underline"
                      onClick={() => setShowAllRows(v => !v)}
                    >
                      {showAllRows ? 'Show first 10' : `Show all ${mappedPlayers.length}`}
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-auto max-h-96">
                  <Table role="table" aria-label="Player import preview">
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">Rank</TableHead>
                        <TableHead scope="col">Name</TableHead>
                        <TableHead scope="col">Rating</TableHead>
                        <TableHead scope="col">DOB</TableHead>
                        <TableHead scope="col">Gender</TableHead>
                        <TableHead scope="col">State</TableHead>
                        <TableHead scope="col">City</TableHead>
                        <TableHead scope="col">Club</TableHead>
                        <TableHead scope="col">Disability</TableHead>
                        <TableHead scope="col">Special Notes</TableHead>
                        <TableHead scope="col">FIDE ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const rowsToShow = showAllRows ? mappedPlayers : mappedPlayers.slice(0, 10);
                        return rowsToShow.map((player, idx) => {
                          const hasConflict = conflicts.some(c => c.row === player._originalIndex);
                          return (
                            <TableRow 
                              key={idx}
                              tabIndex={0}
                              aria-rowindex={idx + 1}
                              className={hasConflict ? 'bg-amber-50/50' : ''}
                            >
                              <TableCell>{player.rank ?? ''}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {player.name ?? ''}
                                  {hasConflict && (
                                    <span className="text-xs text-amber-600" title="Conflict detected">⚠️</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>{player.rating ?? ''}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span>{player.dob ?? ''}</span>
                                  {player._dobInferred && (
                                    <span 
                                      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground border border-border"
                                      title={player._dobInferredReason}
                                    >
                                      Inferred
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>{player.gender ?? ''}</TableCell>
                              <TableCell>{player.state ?? ''}</TableCell>
                              <TableCell>{player.city ?? ''}</TableCell>
                              <TableCell>{player.club ?? ''}</TableCell>
                              <TableCell>{player.disability ?? ''}</TableCell>
                              <TableCell>{player.special_notes ?? ''}</TableCell>
                              <TableCell>{player.fide_id ?? ''}</TableCell>
                            </TableRow>
                          );
                        });
                      })()}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            
            {/* Persistent error panel */}
            {parseStatus === 'error' && (parseError || validationErrors.length > 0 || duplicates.length > 0) && (
              <div className="mb-6 p-4 bg-destructive/10 border border-destructive rounded-lg space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-destructive mb-2">
                      Import Errors Found
                    </h4>
                    
                    {/* Parse error message */}
                    {parseError && (
                      <Alert variant="destructive" className="mb-3">
                        <AlertDescription>
                          <strong>Parse Error:</strong> {parseError}
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    {/* Validation errors */}
                    {validationErrors.length > 0 && (
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
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const errorRows = validationErrors.map(err => ({
                      row: err.row,
                      error: err.errors.join('; '),
                      ...mappedPlayers.find(p => p._originalIndex === err.row)
                    }));
                    downloadErrorXlsx(errorRows);
                    toast.success('Error Excel downloaded');
                  }}
                >
                  Download Error Excel
                </Button>
              </div>
            )}
            
            {/* Replace existing players checkbox */}
            <Card className="border-muted">
              <CardContent className="pt-6 pb-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="replace-existing"
                    checked={replaceExisting}
                    onChange={(e) => setReplaceExisting(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <label htmlFor="replace-existing" className="text-sm cursor-pointer">
                    <span className="font-medium">Replace existing players for this tournament</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      Deletes existing players for this tournament before importing
                    </span>
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Danger Zone */}
            {isOrganizer && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardHeader>
                  <CardTitle className="text-sm text-destructive">Danger Zone</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm('Are you sure you want to clear all players for this tournament? This action cannot be undone.')) {
                        clearPlayersMutation.mutate();
                      }
                    }}
                    disabled={clearPlayersMutation.isPending || importPlayersMutation.isPending}
                  >
                    {clearPlayersMutation.isPending ? 'Clearing...' : 'Clear players for this tournament'}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    This will permanently delete all player records for this tournament from the database.
                  </p>
                </CardContent>
              </Card>
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
                disabled={!canProceed || importPlayersMutation.isPending || isParsing}
              >
                {isParsing ? "Processing..." : importPlayersMutation.isPending ? "Importing..." : `Next: Review & Allocate`}
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
