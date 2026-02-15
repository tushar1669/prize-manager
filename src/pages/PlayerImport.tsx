/**
 * PlayerImport: Excel upload with auto-mapping and validation
 * 
 * Column mapping note: While auto-mapping handles header name variations 
 * (e.g., "Rank" vs "rank"), data must be in semantically correct columns.
 * Swapped columns (e.g., city data in disability column) will cause validation errors.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppNav } from "@/components/AppNav";
import { BackBar } from "@/components/BackBar";
import { TournamentProgressBreadcrumbs } from '@/components/TournamentProgressBreadcrumbs';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileText, AlertCircle, CheckCircle2, IdCard, Users, Hash } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useExcelParser } from "@/hooks/useExcelParser";
import { ColumnMappingDialog } from "@/components/ColumnMappingDialog";
import { playerImportSchema } from "@/lib/validations";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import ErrorPanel from "@/components/ui/ErrorPanel";
import { useErrorPanel } from "@/hooks/useErrorPanel";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useDirty } from "@/contexts/DirtyContext.shared";
import { makeKey, getDraft, clearDraft, formatAge } from '@/utils/autosave';
import { useAutosaveEffect } from '@/hooks/useAutosaveEffect';
import {
  downloadPlayersTemplateXlsx,
  downloadErrorXlsx,
  downloadPlayersXlsx,
  downloadConflictsXlsx,
  downloadCleanedPlayersXlsx,
  type ErrorRow
} from '@/utils/excel';
import {
  HEADER_ALIASES,
  sanitizeDobForImport,
  normalizeHeaderForMatching,
  getNameHeaderCandidates,
  selectBestRatingColumn,
  inferImportSource,
  detectFullVsAbbrevName,
  extractRuleUsedFields,
} from '@/utils/importSchema';
import {
  normalizeRating,
  inferUnrated,
  fillSingleGapRanksInPlace,
  imputeContinuousRanksFromTies,
  normalizeRankValue,
  normalizeGrColumn,
  normalizeTypeColumn,
  type TieRankImputationReport,
} from '@/utils/valueNormalizers';
import { extractStateFromIdent } from '@/utils/stateExtract';
import { selectPresetBySource } from '@/utils/importPresets';
import {
  isFeatureEnabled,
  IMPORT_DEDUP_ENABLED,
  IMPORT_LOGS_ENABLED,
  IMPORT_MERGE_POLICY_DEFAULTS,
  SERVER_IMPORT_ENABLED,
  CONFLICT_REVIEW_ENABLED,
} from '@/utils/featureFlags';
import {
  ConflictPair,
  type ConflictKeyKind,
  detectConflictsInDraft,
  buildFideKey,
  buildNameDobKey,
  buildSnoKey,
  isRankOnlyCollision,
  shouldGroupAsNameDobConflict,
  formatConflictReason,
} from '@/utils/conflictUtils';
import {
  runDedupPass,
  type DedupPassResult,
  type DedupDecision,
  type DedupCandidate,
  type DedupSummary,
  type MergePolicy,
  type DedupAction,
  type DedupIncomingPlayer,
} from '@/utils/dedup';
import { DeduplicationWizard } from "@/components/dedup/DeduplicationWizard";
import { ImportLogsPanel } from "@/components/ImportLogsPanel";
import type { Database } from "@/integrations/supabase/types";
import { maskDobForPublic } from "@/utils/print";
import { safeSelectPlayersByTournament } from "@/utils/safeSelectPlayers";
import {
  buildSupabasePlayerPayload,
  type ParsedPlayer,
  toNumericFideOrNull,
} from '@/utils/playerImportPayload';
import { ImportSummaryBar } from "@/components/import/ImportSummaryBar";
import { DataCoverageBar } from "@/components/import/DataCoverageBar";
import { PlayerRowBadges } from "@/components/import/PlayerRowBadges";
import { GenderSummaryChip } from "@/components/import/GenderSummaryChip";
import { MissingGenderWarning } from "@/components/import/MissingGenderWarning";
import { checkHasFemaleCategories } from "@/components/import/MissingGenderWarning.helpers";
import { analyzeGenderColumns, hasFemaleMarker, inferGenderForRow, type GenderColumnConfig } from '@/utils/genderInference';

/**
 * Bulk upsert players via PostgREST with precise conflict handling.
 * Uses on_conflict=tournament_id,sno to merge duplicates at DB level.
 * Only (tournament_id, sno) conflicts are treated as success.
 * Other conflicts (e.g., fide_id) trigger row-by-row fallback.
 */
async function bulkUpsertPlayers(payload: unknown[]) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token ?? publishableKey;

  const resp = await fetch(`${supabaseUrl}/rest/v1/players?on_conflict=tournament_id,sno`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': publishableKey,
      'Authorization': `Bearer ${token}`,
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    const is409 = resp.status === 409;
    const isSnoConflict = is409 && /\(tournament_id,\s*sno\)/i.test(text);
    throw {
      status: resp.status,
      message: text,
      isConflict: is409,
      isSnoConflict,
    };
  }

  return { ok: true };
}

/**
 * Enforce numeric-only FIDE IDs (6-10 digits).
 */

type ImportLogInsert = Database["public"]["Tables"]["import_logs"]["Insert"];

type ImportLogContext = {
  totalRows: number;
  acceptedRows: number;
  skippedRows: number;
  topReasons: Array<{ reason: string; count: number }>;
  sampleErrors: Array<{ row: number; errors: string[] }>;
};

type LastFileInfo = {
  name: string | null;
  hash: string | null;
  sheetName: string | null;
  headerRow: number | null;
  source: 'swiss-manager' | 'organizer-template' | 'unknown';
};

const GENDER_DENYLIST = new Set(['fs', 'fed', 'federation']);
const ABBREV_NAME_PATTERN = /^[A-Z]\.\s?/;
const DOT_PATTERN = /\./g;

type NameColumnStats = {
  sampleCount: number;
  avgTokens: number;
  avgLength: number;
  abbrevCount: number;
  abbrevRatio: number;
};

const isAbbreviatedNameValue = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (ABBREV_NAME_PATTERN.test(trimmed)) return true;
  const dotCount = (trimmed.match(DOT_PATTERN) ?? []).length;
  return dotCount >= 2;
};

const getNameColumnStats = (
  rows: Array<Record<string, unknown>>,
  column: string
): NameColumnStats | null => {
  const values = rows
    .map(row => String(row[column] ?? '').trim())
    .filter(Boolean);

  const sampleCount = values.length;
  if (sampleCount < 5) return null;

  const totals = values.reduce(
    (acc, name) => {
      const tokens = name.split(/\s+/).filter(Boolean).length;
      acc.tokens += tokens;
      acc.length += name.length;
      if (isAbbreviatedNameValue(name)) {
        acc.abbrev += 1;
      }
      return acc;
    },
    { tokens: 0, length: 0, abbrev: 0 }
  );

  return {
    sampleCount,
    avgTokens: totals.tokens / sampleCount,
    avgLength: totals.length / sampleCount,
    abbrevCount: totals.abbrev,
    abbrevRatio: totals.abbrev / sampleCount,
  };
};

const hasAbbreviatedNameEvidence = (stats: NameColumnStats | null): boolean => {
  if (!stats) return false;
  return stats.abbrevCount >= 3 || stats.abbrevRatio >= 0.2;
};

const looksFullerThan = (candidate: NameColumnStats | null, baseline: NameColumnStats | null): boolean => {
  if (!candidate || !baseline) return false;
  // Tiny heuristic: prefer clearly longer or more tokenized names.
  return candidate.avgTokens > baseline.avgTokens + 0.25
    || candidate.avgLength > baseline.avgLength + 3;
};

const isImportDebugEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('DEBUG_IMPORT') === '1';
};

const maskImportValue = (value: unknown): string => {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text) return '';
  return `${text.slice(0, 2)}***`;
};

const logImportDebug = (message: string, payload?: Record<string, unknown>) => {
  if (!isImportDebugEnabled()) return;
  if (payload) {
    console.log(message, payload);
  } else {
    console.log(message);
  }
};

const RICHNESS_FIELDS = [
  'name',
  'full_name',
  'dob',
  'dob_raw',
  'rating',
  'fide_id',
  'sno',
  'rank',
  'gender',
  'state',
  'city',
  'club',
  'disability',
  'special_notes',
  'federation',
] as const;

const isEmptyConflictValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'number') return !Number.isFinite(value);
  return false;
};

const mergeConflictRows = (
  target: ParsedPlayer | undefined,
  source: Record<string, unknown> | undefined
) => {
  if (!target || !source) return;
  const targetRecord = target as Record<string, unknown>;
  const sourceRecord = source as Record<string, unknown>;
  for (const field of RICHNESS_FIELDS as readonly string[]) {
    const current = targetRecord[field];
    const candidate = sourceRecord[field];
    if (isEmptyConflictValue(current) && !isEmptyConflictValue(candidate)) {
      targetRecord[field] = candidate;
    }
  }
};

const CONFLICT_ORDER: ConflictKeyKind[] = ['fide', 'nameDob', 'sno'];
const CONFLICT_LABELS: Record<ConflictKeyKind, string> = {
  fide: 'FIDE ID',
  nameDob: 'Name + DOB',
  sno: 'SNo',
};

const getConflictRowIndex = (row: Record<string, unknown> | undefined): number | null => {
  if (!row) return null;
  const idx = (row as ParsedPlayer)._originalIndex;
  return typeof idx === 'number' ? idx : null;
};

const CONFLICT_FIELD_DEFS = [
  { key: 'name', label: 'Name' },
  { key: 'dob', label: 'DOB' },
  { key: 'fide_id', label: 'FIDE ID' },
  { key: 'sno', label: 'SNo' },
  { key: 'rank', label: 'Rank' },
  { key: 'rating', label: 'Rating' },
] as const;

type ExistingPlayerRow = {
  id?: string;
  name?: string | null;
  dob?: string | null;
  rating?: number | null;
  fide_id?: string | null;
  sno?: string | null;
  rank?: number | null;
  [key: string]: unknown;
};

async function detectAppendModeConflicts(
  draft: ParsedPlayer[],
  tournamentId: string
): Promise<ConflictPair[]> {
  const { data: existing = [] } = await safeSelectPlayersByTournament(tournamentId, [
    'id',
    'name',
    'dob',
    'rating',
    'fide_id',
    'sno',
    'rank'
  ]);

  const seenByFide = new Map<string, ExistingPlayerRow>();
  const seenByNameDob = new Map<string, ExistingPlayerRow>();
  const seenBySno = new Map<string, ExistingPlayerRow>();

  for (const row of existing as ExistingPlayerRow[]) {
    const fideKey = buildFideKey(row);
    if (fideKey && !seenByFide.has(fideKey)) {
      seenByFide.set(fideKey, row);
    }

    const nameDobKey = buildNameDobKey(row);
    if (nameDobKey && !seenByNameDob.has(nameDobKey)) {
      seenByNameDob.set(nameDobKey, row);
    }

    const snoKey = buildSnoKey(row);
    if (snoKey && !seenBySno.has(snoKey)) {
      seenBySno.set(snoKey, row);
    }
  }

  const conflicts: ConflictPair[] = [];

  for (const draftRow of draft) {
    const fideKey = buildFideKey(draftRow);
    if (fideKey) {
      const existingRow = seenByFide.get(fideKey);
      if (existingRow && !isRankOnlyCollision(existingRow, draftRow)) {
        conflicts.push({
          keyKind: 'fide',
          key: fideKey,
          reason: 'Same FIDE ID',
          a: existingRow,
          b: draftRow,
        });
        continue;
      }
    }

    const nameDobKey = buildNameDobKey(draftRow);
    if (nameDobKey) {
      const existingRow = seenByNameDob.get(nameDobKey);
      if (existingRow && !isRankOnlyCollision(existingRow, draftRow)) {
        // Check if we should treat this as a conflict (different FIDE IDs = different players)
        const { shouldConflict, reason } = shouldGroupAsNameDobConflict(existingRow, draftRow);
        if (shouldConflict) {
          conflicts.push({
            keyKind: 'nameDob',
            key: nameDobKey,
            reason,
            a: existingRow,
            b: draftRow,
          });
          continue;
        }
        // Different FIDE IDs → not a conflict, treat as separate players
      }
    }

    const snoKey = buildSnoKey(draftRow);
    if (snoKey) {
      const existingRow = seenBySno.get(snoKey);
      if (existingRow && !isRankOnlyCollision(existingRow, draftRow)) {
        conflicts.push({
          keyKind: 'sno',
          key: snoKey,
          reason: 'Duplicate SNo',
          a: existingRow,
          b: draftRow,
        });
      }
    }
  }

  return conflicts;
}

const conflictKeyForIndex = (pair: ConflictPair, index: number) => `${pair.keyKind}:${pair.key}:${index}`;

// Helper functions for smart retry
const pick = (obj: Record<string, unknown>, keys: string[]) =>
  keys.reduce((acc, k) => { if (k in obj) acc[k] = obj[k]; return acc; }, {} as Record<string, unknown>);

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

type DobSanitizationResult = {
  dob: string | null;
  dob_original: string | null;
  wasImputedFromYear: boolean;
  inferred: boolean;
  inferredReason?: string;
};

type DobImputationRow = {
  rowNumber: number;
  rank: number | null;
  dob_original: string | null;
  dob_saved: string | null;
};

type DobImputationReport = {
  totalImputed: number;
  rows: DobImputationRow[];
};

// Helper: normalize DOB to YYYY-MM-DD, handling partial dates
const toISODate = (d: unknown): DobSanitizationResult => {
  if (!d) {
    return {
      dob: null,
      dob_original: null,
      wasImputedFromYear: false,
      inferred: false
    };
  }
  
  // Handle Excel serial dates
  if (typeof d === 'number') {
    const jsDate = new Date(Math.round((d - 25569) * 86400 * 1000));
    if (isNaN(jsDate.getTime())) {
      return {
        dob: null,
        dob_original: String(d),
        wasImputedFromYear: false,
        inferred: false
      };
    }
    const normalized = jsDate.toISOString().slice(0, 10);
    return {
      dob: normalized,
      dob_original: normalized,
      wasImputedFromYear: false,
      inferred: false
    };
  }
  
  // Use centralized normalization
  return sanitizeDobForImport(String(d));
};

export default function PlayerImport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { parseFile } = useExcelParser();
  const { error, showError, clearError } = useErrorPanel();
  const { setDirty, resetDirty } = useDirty();
  const queryClient = useQueryClient();

  const [parsedData, setParsedData] = useState<unknown[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappedPlayers, setMappedPlayers] = useState<ParsedPlayer[]>([]);
  const [validationErrors, setValidationErrors] = useState<{ row: number; errors: string[] }[]>([]);
  const [duplicates, setDuplicates] = useState<{ row: number; duplicate: string }[]>([]);
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [parseError, setParseError] = useState<string | null>(null);
  const [autoFilledRankCount, setAutoFilledRankCount] = useState(0);
  const [tieRankReport, setTieRankReport] = useState<TieRankImputationReport | null>(null);
  const [showTieRankDetails, setShowTieRankDetails] = useState(false);
  const [dobImputationReport, setDobImputationReport] = useState<DobImputationReport | null>(null);
  const [showDobImputationDetails, setShowDobImputationDetails] = useState(false);
  const [showSwissManagerTip, setShowSwissManagerTip] = useState(false);
  const [statesExtractedCount, setStatesExtractedCount] = useState(0);
  const [lastParseMode, setLastParseMode] = useState<'local' | 'server' | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [replaceBanner, setReplaceBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [importErrorBanner, setImportErrorBanner] = useState<{
    type: 'rank-conflict' | 'other';
    message: string;
    failedCount: number;
  } | null>(null);
  const [fullNameMissingBanner, setFullNameMissingBanner] = useState<boolean>(false);
  const [importSource, setImportSource] = useState<'swiss-manager' | 'template' | 'unknown'>('unknown');
  const [dedupeState, setDedupeState] = useState<DedupPassResult | null>(null);
  const [dedupeDecisions, setDedupeDecisions] = useState<DedupDecision[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [isRunningDedup, setIsRunningDedup] = useState(false);
  const [dedupeReviewed, setDedupeReviewed] = useState(false);
  const [dataCoverage, setDataCoverage] = useState<{
    dob: number;
    gender: number;
    state: number;
    city: number;
    federation: number;
  } | null>(null);
  const [femaleCountSummary, setFemaleCountSummary] = useState<{
    femaleFromGender: number;
    femaleFromFmg: number;
    maleFromGender: number;
    genderSources: import("@/utils/genderInference").GenderSource[];
  } | null>(null);
  const hasMappedRef = useRef(false);
  const genderConfigRef = useRef<GenderColumnConfig | null>(null);
  const logContextRef = useRef<ImportLogContext | null>(null);
  const lastFileInfoRef = useRef<LastFileInfo>({
    name: null,
    hash: null,
    sheetName: null,
    headerRow: null,
    source: 'unknown'
  });
  const importStartedAtRef = useRef<number | null>(null);
  const nameHeaderCandidates = useMemo(() => {
    return getNameHeaderCandidates(headers);
  }, [headers]);

  const persistImportLog = useCallback(async (payload: ImportLogInsert) => {
    if (!IMPORT_LOGS_ENABLED) {
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('import_logs')
        .insert(payload)
        .select('id')
        .single();

      if (error) {
        throw error;
      }

      console.log(`[import.log] inserted id=${data.id}`);
      return data.id as string;
    } catch (err) {
      console.warn('[import.log] insert failed', err);
      return null;
    }
  }, []);

  // STATE DECLARATIONS - Must be before callbacks that use them
  const [dbPlayers, setDbPlayers] = useState<Array<{
    id: string;
    name: string;
    dob?: string | null;
    rating?: number | null;
    fide_id?: string | null;
    gender?: string | null;
    sno?: string | null;
    rank?: number | null;
    city?: string | null;
    state?: string | null;
    club?: string | null;
    federation?: string | null;
    disability?: string | null;
    special_notes?: string | null;
  }>>([]);

  const [conflicts, setConflicts] = useState<ConflictPair[]>([]);
  const [conflictResolutions, setConflictResolutions] = useState<Record<string, 'keepA' | 'keepB' | 'merge' | 'keepBoth'>>({});
  const [fileHash, setFileHash] = useState<string | null>(null);
  
  const importDraftKey = makeKey(`t:${id}:import`);
  const [importRestore, setImportRestore] = useState<null | {
    data: {
      mappedPlayers: ParsedPlayer[];
      conflicts: ConflictPair[];
      replaceExisting: boolean;
    };
    ageMs: number
  }>(null);
  const conflictStorageKey = useMemo(() => {
    if (!id || !fileHash) return null;
    return `${id}:${fileHash}:conflictResolutions`;
  }, [fileHash, id]);

  const countFilledFields = useCallback((row: Record<string, unknown>) => {
    return RICHNESS_FIELDS.reduce((acc, field) => {
      const value = row[field];
      if (value === null || value === undefined) return acc;
      if (typeof value === 'string' && value.trim().length === 0) return acc;
      return acc + 1;
    }, 0);
  }, []);

  const pickMergeWinner = useCallback(
    (pair: ConflictPair): 'a' | 'b' => {
      const countA = countFilledFields(pair.a);
      const countB = countFilledFields(pair.b);
      if (countA > countB) return 'a';
      if (countB > countA) return 'b';

      const ratingA = Number((pair.a as Record<string, unknown>)?.['rating'] ?? 0);
      const ratingB = Number((pair.b as Record<string, unknown>)?.['rating'] ?? 0);
      if (Number.isFinite(ratingA) && Number.isFinite(ratingB)) {
        if (ratingA > ratingB) return 'a';
        if (ratingB > ratingA) return 'b';
      }

      return 'a';
    },
    [countFilledFields],
  );

  const applyConflictResolutions = useCallback(
    (players: ParsedPlayer[]): ParsedPlayer[] => {
      if (conflicts.length === 0) {
        return players;
      }

      const nextPlayers = players.map(player => ({ ...player }));
      const playersByOriginalIndex = new Map<number, ParsedPlayer>();
      nextPlayers.forEach(player => {
        playersByOriginalIndex.set(player._originalIndex, player);
      });
      const getPlayerByIndex = (index: number | null) =>
        index != null ? playersByOriginalIndex.get(index) : undefined;

      const indexesToRemove = new Set<number>();
      let mergeApplied = false;

      const extractIndex = (row: Record<string, unknown>): number | null => {
        const idx = (row as ParsedPlayer)._originalIndex;
        return typeof idx === 'number' ? idx : null;
      };

      conflicts.forEach((pair, index) => {
        const key = conflictKeyForIndex(pair, index);
        const resolution = conflictResolutions[key];
        if (!resolution) {
          return;
        }

        if (resolution === 'keepA') {
          const bIndex = extractIndex(pair.b);
          if (bIndex != null) {
            indexesToRemove.add(bIndex);
          }
          return;
        }

        if (resolution === 'keepB') {
          const aIndex = extractIndex(pair.a);
          if (aIndex != null) {
            indexesToRemove.add(aIndex);
          }
          return;
        }

        if (resolution === 'keepBoth') {
          // Keep both rows - don't remove either
          return;
        }

        const aIndex = extractIndex(pair.a);
        const bIndex = extractIndex(pair.b);
        const winner = pickMergeWinner(pair);
        console.log('[conflict.merge] applying merge', {
          keyKind: pair.keyKind,
          aRow: getConflictRowIndex(pair.a),
          bRow: getConflictRowIndex(pair.b),
        });
        if (winner === 'a') {
          mergeConflictRows(getPlayerByIndex(aIndex), pair.b);
          if (bIndex != null) {
            indexesToRemove.add(bIndex);
          }
        } else {
          mergeConflictRows(getPlayerByIndex(bIndex), pair.a);
          if (aIndex != null) {
            indexesToRemove.add(aIndex);
          }
        }
        mergeApplied = true;
      });

      const result = nextPlayers.filter(player => !indexesToRemove.has(player._originalIndex));
      if (mergeApplied) {
        console.log('[conflict.merge]', { mergedKept: result.length, removed: indexesToRemove.size });
      }
      return result;
    },
    [conflictResolutions, conflicts, pickMergeWinner],
  );

  const unresolvedCount = useMemo(() => {
    if (conflicts.length === 0) return 0;
    return conflicts.reduce((count, pair, index) => {
      const key = conflictKeyForIndex(pair, index);
      return count + (conflictResolutions[key] ? 0 : 1);
    }, 0);
  }, [conflictResolutions, conflicts]);

  const conflictIndexMap = useMemo(() => {
    const map = new Map<ConflictPair, number>();
    conflicts.forEach((pair, index) => {
      map.set(pair, index);
    });
    return map;
  }, [conflicts]);

  const conflictGroups = useMemo(() => {
    return conflicts.reduce<Record<ConflictKeyKind, ConflictPair[]>>((acc, pair) => {
      acc[pair.keyKind].push(pair);
      return acc;
    }, { fide: [], nameDob: [], sno: [] });
  }, [conflicts]);

  const updateResolution = useCallback((key: string, value: 'keepA' | 'keepB' | 'merge' | 'keepBoth') => {
    setConflictResolutions(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleAcceptFirstOccurrence = useCallback(() => {
    setConflictResolutions(() => {
      const next: Record<string, 'keepA' | 'keepB' | 'merge' | 'keepBoth'> = {};
      conflicts.forEach((pair, index) => {
        next[conflictKeyForIndex(pair, index)] = 'keepA';
      });
      return next;
    });
  }, [conflicts]);

  const handlePreferRichestRow = useCallback(() => {
    setConflictResolutions(() => {
      const next: Record<string, 'keepA' | 'keepB' | 'merge' | 'keepBoth'> = {};
      conflicts.forEach((pair, index) => {
        next[conflictKeyForIndex(pair, index)] = 'merge';
      });
      return next;
    });
  }, [conflicts]);

  const formatFieldValue = useCallback((value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : '—';
    }
    return String(value);
  }, []);

  const renderConflictDetails = useCallback(
    (row: Record<string, unknown>) => (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {CONFLICT_FIELD_DEFS.map(field => (
          <div key={field.key}>
            <dt className="font-semibold text-foreground">{field.label}</dt>
            <dd className="text-foreground/80">
              {formatFieldValue(row[field.key] as unknown)}
            </dd>
          </div>
        ))}
      </dl>
    ),
    [formatFieldValue],
  );

  const [importConfig, setImportConfig] = useState(() => ({
    stripCommasFromRating: true,
    preferRtgOverIRtg: true,
    treatEmptyAsUnrated: false,
    inferUnratedFromMissingData: isFeatureEnabled('UNRATED_INFERENCE'),
    preferServer: false,
    mergePolicy: { ...IMPORT_MERGE_POLICY_DEFAULTS },
  }));

  const runDedupe = useCallback(
    async (
      players: ParsedPlayer[],
      options: { autoOpen?: boolean; policy?: MergePolicy; allowMerge?: boolean } = {},
    ) => {
      const applyFallback = (forceCloseDialog = false) => {
        const fallbackDecisions = players.map(player => ({ row: player._originalIndex, action: 'create' as const }));
        setDedupeState(null);
        setDedupeDecisions(fallbackDecisions);
        setDedupeReviewed(true);
        if (options.autoOpen || forceCloseDialog) {
          setShowDuplicateDialog(false);
        }
      };

      if (replaceExisting) {
        const result = await runDedupPass({
          client: supabase,
          tournamentId: id,
          incomingPlayers: players as DedupIncomingPlayer[],
          mergePolicy: options.policy ?? importConfig.mergePolicy,
          replaceExisting: true,
        });

        setDedupeState(result);
        setDedupeDecisions(result.decisions);
        setDedupeReviewed(true);
        setShowDuplicateDialog(false);
        return;
      }

      if (!IMPORT_DEDUP_ENABLED || !id || players.length === 0) {
        applyFallback();
        return;
      }

      setIsRunningDedup(true);

      try {
        const policy = options.policy ?? importConfig.mergePolicy;
        const allowMerge = options.allowMerge ?? !replaceExisting;
        console.log('[dedup] run', {
          count: players.length,
          policy,
        });

        const result = await runDedupPass({
          client: supabase,
          tournamentId: id,
          incomingPlayers: players as DedupIncomingPlayer[],
          existingPlayers: dbPlayers,
          mergePolicy: policy,
        });

        const nextDecisions = allowMerge
          ? result.decisions
          : result.candidates.map(candidate => ({ row: candidate.row, action: 'create' as const }));

        setDedupeState(result);
        setDedupeDecisions(nextDecisions);
        setDedupeReviewed(!allowMerge);
        if (!allowMerge) {
          setShowDuplicateDialog(false);
        }

        if (options.autoOpen && result.candidates.some(candidate => candidate.bestMatch)) {
          setShowDuplicateDialog(true);
        }
      } catch (err) {
        console.warn('[dedup] pass error', err);
        const fallbackDecisions = players.map(player => ({ row: player._originalIndex, action: 'create' as const }));
        setDedupeState(null);
        setDedupeDecisions(fallbackDecisions);
        setDedupeReviewed(true);
      } finally {
        setIsRunningDedup(false);
      }
    },
    [dbPlayers, id, importConfig.mergePolicy, replaceExisting],
  );

  const handleMergePolicyChange = useCallback(
    (policy: MergePolicy) => {
      setImportConfig(prev => ({ ...prev, mergePolicy: policy }));
      setDedupeReviewed(false);
      if (mappedPlayers.length > 0) {
        void runDedupe(mappedPlayers, { policy });
      }
    },
    [mappedPlayers, runDedupe],
  );

  const handleDecisionsChange = useCallback((decisions: DedupDecision[]) => {
    setDedupeDecisions(decisions);
    setDedupeReviewed(false);
  }, []);

  const handleReplaceExistingChange = useCallback(
    (checked: boolean) => {
      if (checked && !replaceExisting) {
        const confirmed = confirm(
          'This will delete all players in this tournament before importing the new file. Continue?',
        );

        if (!confirmed) {
          toast.info('Replace mode remains off. Existing players will be preserved.');
          return;
        }

        toast.warning('Replace mode enabled. Existing players will be deleted before import.');
      }

      setReplaceExisting(checked);

      if (!checked) {
        setReplaceBanner(null);
      }
    },
    [replaceExisting],
  );

  // TYPE & MUTATION DECLARATIONS - Must be before callbacks
  type ImportMutationPayload = {
    players: ParsedPlayer[];
    dedupe?: { decisions: DedupDecision[]; summary: DedupSummary } | null;
  };

  const clearPlayersMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('Tournament ID missing');
      const { error } = await supabase.from('players').delete().eq('tournament_id', id);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      toast.success('Cleared all players');
      setParsedData([]);
      setHeaders([]);
      setMappedPlayers([]);
      setValidationErrors([]);
      setDuplicates([]);
      setParseError(null);
      setParseStatus('idle');
    },
    onError: (err: unknown) => toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
  });

  const importPlayersMutation = useMutation({
    onMutate: () => {
      importStartedAtRef.current = typeof performance !== 'undefined' ? performance.now() : null;
      setReplaceBanner(null);
      setImportErrorBanner(null);
    },
    mutationFn: async ({ players, dedupe }: ImportMutationPayload) => {
      console.time('[import] batch-insert');

      const CHUNK_SIZE = 500;

      const results = {
        created: [] as ParsedPlayer[],
        updated: [] as ParsedPlayer[],
        skipped: [] as Array<{ player: ParsedPlayer; reason: string }>,
        failed: [] as Array<{ player: ParsedPlayer; error: string }>,
      };

      const buildRows = (playerList: ParsedPlayer[]) =>
        playerList.map(p => buildSupabasePlayerPayload(p, id!));

      if (replaceExisting) {
        const rpcPayload = players.map(player => ({
          row_index: player._originalIndex,
          ...buildSupabasePlayerPayload(player, id!),
        }));

        type RpcResultRow = { error_rows?: Array<{ row_index?: number; rank?: number; reason?: string }>; inserted_count?: number };
        const { data, error } = await supabase.rpc('import_replace_players', {
          tournament_id: id,
          players: rpcPayload,
        });

        if (error) {
          const message = `Failed to replace players: ${error.message}`;
          setReplaceBanner({ type: 'error', message });
          throw new Error(message);
        }

        const rpcResult = (Array.isArray(data) ? data?.[0] : data) as RpcResultRow | null;
        const rpcErrors = rpcResult?.error_rows ?? [];
        const failedIndices = new Set<number>();

        rpcErrors.forEach((errRow) => {
          const rowIndex = Number(errRow?.row_index);
          if (Number.isFinite(rowIndex)) {
            failedIndices.add(rowIndex);
            const player = players.find(p => p._originalIndex === rowIndex);
            if (player) {
              const rank = errRow?.rank ?? player.rank;
              const reason = errRow?.reason
                ?? `Duplicate rank ${rank ?? ''} in import file (tournament rank must be unique).`;
              results.failed.push({ player, error: reason });
            }
          }
        });

        const insertedCount = rpcResult?.inserted_count ?? 0;

        if (failedIndices.size > 0) {
          setReplaceBanner({
            type: 'error',
            message: 'Import aborted due to duplicate ranks. Download the error workbook for details.',
          });
        } else {
          results.created.push(...players);
          setReplaceBanner({
            type: 'success',
            message: `Replaced ${insertedCount} player${insertedCount === 1 ? '' : 's'} in a single transaction.`,
          });
          toast.success('Existing players replaced successfully');
        }
      } else if (IMPORT_DEDUP_ENABLED && dedupe) {
        const playersByRow = new Map(players.map(p => [p._originalIndex, p]));

        const createEntries = dedupe.decisions
          .filter(decision => decision.action === 'create')
          .flatMap(decision => {
            const player = playersByRow.get(decision.row);
            if (!player) return [];
            const [payload] = buildRows([player]);
            return [{ decision, player, payload }];
          });

        const updateEntriesAll = dedupe.decisions
          .filter(decision => decision.action === 'update' && decision.existingId)
          .flatMap(decision => {
            const player = playersByRow.get(decision.row);
            if (!player) return [];
            const changes = decision.payload ?? {};
            return [{ decision, player, changes }];
          });

        const actionableUpdates = updateEntriesAll.filter(entry => Object.keys(entry.changes).length > 0);
        const noopUpdates = updateEntriesAll.filter(entry => Object.keys(entry.changes).length === 0);

        noopUpdates.forEach(entry => {
          results.skipped.push({ player: entry.player, reason: 'No changes from merge policy' });
        });

        const skipEntries = dedupe.decisions
          .filter(decision => decision.action === 'skip')
          .flatMap(decision => {
            const player = playersByRow.get(decision.row);
            if (!player) return [];
            return [{ decision, player }];
          });

        skipEntries.forEach(entry => {
          results.skipped.push({ player: entry.player, reason: 'User selected skip' });
        });

        const actionPayload = {
          creates: createEntries.map(entry => ({ row: entry.decision.row, values: entry.payload })),
          updates: actionableUpdates.map(entry => ({
            row: entry.decision.row,
            existing_id: entry.decision.existingId,
            changes: entry.changes,
          })),
          skips: skipEntries.map(entry => ({
            row: entry.decision.row,
            existing_id: entry.decision.existingId ?? null,
          })),
        };

        console.log('[dedup] plan', {
          creates: actionPayload.creates.length,
          updates: actionPayload.updates.length,
          skips: results.skipped.length,
        });

        let appliedViaRpc = false;

        if (actionPayload.creates.length > 0 || actionPayload.updates.length > 0) {
          try {
            // Using type assertion for RPC that may not exist yet
            const rpcResult = await supabase.rpc('import_replace_players', {
              tournament_id: id,
              players: actionPayload.creates,
            });
            const rpcError = rpcResult.error as { code?: string; message?: string } | null;

            if (rpcError) {
              // Handle PGRST202 (function not found) gracefully - it's expected during development
              const isPgrst202 = rpcError?.code === 'PGRST202' || rpcError?.message?.includes('Could not find function');
              if (isPgrst202) {
                console.info('[dedup] import_apply_actions RPC not available, using local fallback');
              } else {
                console.warn('[dedup] apply RPC failed', rpcError);
              }
            } else {
              appliedViaRpc = true;
              console.log('[dedup] RPC applied', rpcResult.data);
              results.created.push(...createEntries.map(entry => entry.player));
              results.updated.push(...actionableUpdates.map(entry => entry.player));
            }
          } catch (err: unknown) {
            // Handle network/404 errors for missing RPC
            const errObj = err as { status?: number; code?: string } | null;
            const is404 = errObj?.status === 404 || errObj?.code === 'PGRST202';
            if (is404) {
              console.info('[dedup] import_apply_actions RPC not available, using local fallback');
            } else {
              console.warn('[dedup] apply RPC threw', err);
            }
          }
        } else {
          appliedViaRpc = true;
        }

        if (!appliedViaRpc) {
          // Detect potential rank conflicts BEFORE attempting inserts
          if (createEntries.length > 0 && dbPlayers.length > 0) {
            const existingRanks = new Set(dbPlayers.map(p => p.rank).filter(r => r != null));
            const conflictingRanks = createEntries.filter(entry => 
              entry.player.rank != null && existingRanks.has(entry.player.rank)
            );
            
            if (conflictingRanks.length > 0) {
              console.warn(
                '[dedup] warning: some create actions reuse existing rank values; these rows will likely fail due to players_uniq_tourn_rank',
                { count: conflictingRanks.length, ranks: conflictingRanks.map(e => e.player.rank) }
              );
            }
          }

          if (createEntries.length > 0) {
            const createChunks: (typeof createEntries)[] = [];
            for (let i = 0; i < createEntries.length; i += CHUNK_SIZE) {
              createChunks.push(createEntries.slice(i, i + CHUNK_SIZE));
            }

            for (let i = 0; i < createChunks.length; i++) {
              const chunk = createChunks[i];
              console.log(`[dedup] create chunk ${i + 1}/${createChunks.length} (${chunk.length})`);
              const payload = chunk.map(entry => entry.payload);
              
              let bulkError: unknown = null;
              try {
                await bulkUpsertPlayers(payload);
              } catch (err: unknown) {
                bulkError = err;
              }

              if (!bulkError) {
                results.created.push(...chunk.map(entry => entry.player));
              } else if ((bulkError as { isSnoConflict?: boolean })?.isSnoConflict) {
                // 409 on (tournament_id, sno) is merged by PostgREST; treat as success
                results.created.push(...chunk.map(entry => entry.player));
              } else {
                // true failure (network, RLS, validation, OR 409 on (tournament_id, fide_id))
                console.warn('[dedup] chunk create failed (non-SNo conflict), trying individually', (bulkError as { message?: string })?.message);
                for (const entry of chunk) {
                  const { error: singleError } = await supabase.from('players').insert([entry.payload]);
                  if (!singleError) {
                    results.created.push(entry.player);
                  } else {
                    results.failed.push({ player: entry.player, error: singleError.message });
                  }
                }
              }
            }
          }

          if (actionableUpdates.length > 0) {
            for (const entry of actionableUpdates) {
              const { error } = await supabase
                .from('players')
                .update(entry.changes)
                .eq('id', entry.decision.existingId)
                .eq('tournament_id', id);

              if (!error) {
                results.updated.push(entry.player);
              } else {
                results.failed.push({ player: entry.player, error: error.message });
              }
            }
          }
        }
      } else {
        const chunks: ParsedPlayer[][] = [];
        for (let i = 0; i < players.length; i += CHUNK_SIZE) {
          chunks.push(players.slice(i, i + CHUNK_SIZE));
        }

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          console.log(`[import] Chunk ${i + 1}/${chunks.length} (${chunk.length} players)`);
          const payload = buildRows(chunk);
          
          let bulkError: unknown = null;
          try {
            await bulkUpsertPlayers(payload);
          } catch (err: unknown) {
            bulkError = err;
          }

              if (!bulkError) {
                results.created.push(...chunk);
              } else if ((bulkError as { isSnoConflict?: boolean })?.isSnoConflict) {
                // 409 on (tournament_id, sno) is merged by PostgREST; treat as success
                results.created.push(...chunk);
              } else {
                // true failure (network, RLS, validation, OR 409 on (tournament_id, fide_id))
                console.warn('[import] Chunk failed (non-SNo conflict), trying individual inserts', (bulkError as { message?: string })?.message);
            for (const player of chunk) {
              const [singlePayload] = buildRows([player]);
              const { error: singleError } = await supabase.from('players').insert([singlePayload]);

              if (!singleError) {
                results.created.push(player);
              } else {
                results.failed.push({ player, error: singleError.message });
              }
            }
          }
        }
      }

      if (!replaceExisting && IMPORT_DEDUP_ENABLED && dedupe) {
        console.log('[dedup] applied', {
          created: results.created.length,
          updated: results.updated.length,
          skipped: results.skipped.length,
          failed: results.failed.length,
        });
      }

      console.timeEnd('[import] batch-insert');

      const duration = importStartedAtRef.current != null
        ? (typeof performance !== 'undefined' ? performance.now() : Date.now()) - importStartedAtRef.current
        : null;
      importStartedAtRef.current = null;

      const skippedFromValidation = logContextRef.current?.skippedRows ?? 0;
      const totalImported = results.created.length + results.updated.length;
      const dedupeMeta = dedupe
        ? {
            plan: dedupe.summary,
            executed: {
              created: results.created.length,
              updated: results.updated.length,
              skipped: results.skipped.length,
              failed: results.failed.length,
            },
          }
        : null;

      const context = logContextRef.current;
      const lastFile = lastFileInfoRef.current;
      const MAX_IMPORT_SUMMARY_ROWS = 200;
      const limitRows = <T,>(rows: T[]) => rows.slice(0, MAX_IMPORT_SUMMARY_ROWS);
      const buildDobYearHistogram = (rows: DobImputationRow[]) => {
        const counts = new Map<string, number>();
        rows.forEach((row) => {
          const raw = row.dob_original ?? row.dob_saved ?? "";
          const match = String(raw).match(/^(\d{4})/);
          if (!match) return;
          const year = match[1];
          counts.set(year, (counts.get(year) ?? 0) + 1);
        });
        return Array.from(counts.entries())
          .map(([year, count]) => ({ year, count }))
          .sort((a, b) => Number(a.year) - Number(b.year));
      };

      const importSummary = {
        created_at: new Date().toISOString(),
        tournament_id: id,
        import_mode: replaceExisting ? 'replace' : 'append',
        rowCounts: {
          parsed: context?.totalRows ?? players.length,
          validated: context?.acceptedRows ?? totalImported,
          imported: totalImported,
        },
        tieRanks: tieRankReport
          ? {
              totalImputed: tieRankReport.totalImputed,
              rows: limitRows(tieRankReport.rows),
              warnings: limitRows(tieRankReport.warnings),
              ranges: tieRankReport.groups.map((group) => ({
                tieAnchorRank: group.tieAnchorRank,
                startRowIndex: group.startRowIndex,
                endRowIndex: group.endRowIndex,
                imputedCount: group.imputedRanks.length,
              })),
            }
          : {
              totalImputed: 0,
              rows: [],
              warnings: [],
              ranges: [],
            },
        dob: dobImputationReport
          ? {
              totalImputed: dobImputationReport.totalImputed,
              rows: limitRows(dobImputationReport.rows),
              yearHistogram: buildDobYearHistogram(dobImputationReport.rows),
            }
          : {
              totalImputed: 0,
              rows: [],
              yearHistogram: [],
            },
      };

      // Import quality data is stored in import_logs.meta.import_summary
      // QA checklist:
      // - After migration + successful Replace import, Review & Allocate shows counts and "View details".
      // - Refresh keeps it visible.
      const isLatestQualityMissingColumn = (error: { message?: string } | null) =>
        Boolean(
          error?.message?.includes('latest_import_quality') &&
          error.message.includes('does not exist'),
        );

      if (IMPORT_LOGS_ENABLED && id) {
        const payload: ImportLogInsert = {
          tournament_id: id,
          imported_by: user?.id ?? null,
          filename: lastFile.name,
          file_hash: lastFile.hash,
          source: lastFile.source,
          sheet_name: lastFile.sheetName,
          header_row: lastFile.headerRow,
          total_rows: context?.totalRows ?? players.length,
          accepted_rows: totalImported,
          skipped_rows: skippedFromValidation + results.failed.length + results.skipped.length,
          top_reasons: context?.topReasons ?? [],
          sample_errors: context?.sampleErrors ?? [],
          duration_ms: duration != null ? Math.round(duration) : null,
          meta: JSON.parse(JSON.stringify({
            replace_existing: replaceExisting,
            duplicate_count: duplicates.length,
            failed_inserts: results.failed.length,
            validation_skipped: skippedFromValidation,
            import_config: { ...importConfig },
            dedupe_summary: dedupeMeta,
            import_success: results.failed.length === 0,
            import_summary: importSummary,
          })),
        };

        void persistImportLog(payload).then((insertedId) => {
          if (insertedId) {
            queryClient.invalidateQueries({ queryKey: ['import-logs', id] }).catch(() => {});
          }
        });
      }

      // Persist import quality notes BEFORE navigating away
      if (id && results.failed.length === 0) {
        try {
          const { error } = await supabase
            .from('tournaments')
            .update({ latest_import_quality: importSummary })
            .eq('id', id);

          if (error) {
            if (isLatestQualityMissingColumn(error)) {
              console.warn('[import] latest_import_quality column missing; skipping persistence.');
            } else {
              console.error('[import] Failed to persist import quality:', error.message, error.details);
            }
          } else {
            console.log('[import] Persisted import quality notes successfully.');
          }
        } catch (err) {
          console.error('[import] Exception persisting import quality:', err);
        }
      }

      logContextRef.current = null;

      clearDraft(importDraftKey);
      resetDirty('import');

      if (results.failed.length === 0) {
        toast.success(
          `Applied ${totalImported} player actions (${results.created.length} created, ${results.updated.length} updated)`,
        );
        if (id) {
          await queryClient.invalidateQueries({ queryKey: ['players', id] }).catch(() => {});
          await queryClient.invalidateQueries({ queryKey: ['players-list', id] }).catch(() => {});
          await queryClient.invalidateQueries({ queryKey: ['prizes', id] }).catch(() => {});
          await queryClient.invalidateQueries({ queryKey: ['prizes-list', id] }).catch(() => {});
        }
        navigate(`/t/${id}/review`);
      } else {
        // Check if failures are due to rank uniqueness constraint
        const rankConflictCount = results.failed.filter(f =>
          f.error.includes('players_uniq_tourn_rank') ||
          f.error.includes('duplicate key') ||
          f.error.toLowerCase().includes('tournament rank must be unique')
        ).length;

        if (rankConflictCount > 0) {
          setImportErrorBanner({
            type: 'rank-conflict',
            message: `${rankConflictCount} player${rankConflictCount === 1 ? '' : 's'} used rank numbers that are already taken in this tournament.`,
            failedCount: rankConflictCount,
          });
          toast.error(`${rankConflictCount} player${rankConflictCount === 1 ? '' : 's'} could not be imported due to rank conflicts`);
        } else {
          setImportErrorBanner({
            type: 'other',
            message: `${results.failed.length} player${results.failed.length === 1 ? '' : 's'} failed to import.`,
            failedCount: results.failed.length,
          });
          toast.warning(`Applied ${totalImported} player actions. ${results.failed.length} failed.`);
        }

        const errorRows: ErrorRow[] = results.failed.map(f => ({
          rowIndex: f.player._originalIndex,
          reason: f.error,
          original: {
            rank: f.player.rank,
            name: f.player.name,
            full_name: f.player.full_name ?? null,
            rating: f.player.rating,
            dob: f.player.dob,
            gender: f.player.gender,
            state: f.player.state,
            city: f.player.city,
            club: f.player.club,
            disability: f.player.disability,
            special_notes: f.player.special_notes,
            fide_id: f.player.fide_id,
            federation: f.player.federation,
          }
        }));

        console.log('[import] error-xlsx requested', { errors: errorRows.length });

        const originals = parsedData as Record<string, unknown>[];
        const today = new Date().toISOString().slice(0, 10);
        const filename = `${tournamentSlug}_errors_${today}.xlsx`;

        try {
          const ok = await downloadErrorXlsx(errorRows, originals, filename);
          if (ok) {
            toast.success(`Downloaded error workbook (${errorRows.length} rows)`);
          } else {
            toast.info('No validation errors to download — all rows valid.');
          }
        } catch (err) {
          console.error('[import] error-xlsx auto-download failed', err);
          toast.error('Failed to generate error workbook.');
        }
      }
    },
    onError: (err: unknown) => {
      importStartedAtRef.current = null;
      const errMsg = (err as { message?: string })?.message || 'Import failed';
      toast.error(errMsg);
      if (replaceExisting) {
        setReplaceBanner({
          type: 'error',
          message: errMsg,
        });
      }
    }
  });

  // Auth & role for organizer guard
  const { user } = useAuth();
  const { isMaster } = useUserRole();

  // Fetch tournament to check ownership
  const { data: tournament } = useQuery({
    queryKey: ['tournament', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('owner_id, slug')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Tournament not found');
      return data;
    },
    enabled: !!id,
  });

  const startImportFlow = useCallback(() => {
    if (importPlayersMutation.isPending || isRunningDedup) {
      return;
    }

    if (mappedPlayers.length === 0) {
      toast.error('No players mapped for import');
      return;
    }

    if (!id) {
      toast.error('Tournament ID missing');
      navigate('/dashboard');
      return;
    }

    if (conflicts.length > 0 && unresolvedCount > 0) {
      toast.error('Resolve all conflicts before importing');
      return;
    }

    const playersToImport = conflicts.length > 0
      ? applyConflictResolutions(mappedPlayers)
      : mappedPlayers;

    const dedupePlan = !replaceExisting && IMPORT_DEDUP_ENABLED ? dedupeState : null;

    if (dedupePlan && dedupePlan.candidates.some(candidate => candidate.bestMatch) && !dedupeReviewed) {
      setShowDuplicateDialog(true);
      return;
    }

    if (replaceExisting && isMaster && tournament && user && tournament.owner_id !== user.id) {
      const confirmed = window.confirm(
        'You are replacing players for another organizer. This will overwrite data.'
      );
      if (!confirmed) {
        return;
      }
    }

    importPlayersMutation.mutate({
      players: playersToImport,
      dedupe: dedupePlan
        ? { decisions: dedupeDecisions, summary: dedupePlan.summary }
        : null,
    });
  }, [
    applyConflictResolutions,
    conflicts,
    dedupeDecisions,
    dedupeReviewed,
    dedupeState,
    id,
    importPlayersMutation,
    isRunningDedup,
    mappedPlayers,
    navigate,
    replaceExisting,
    isMaster,
    tournament,
    unresolvedCount,
    user,
  ]);

  const handleConfirmDuplicates = useCallback(() => {
    if (mappedPlayers.length === 0) {
      setShowDuplicateDialog(false);
      return;
    }

    setDedupeReviewed(true);
    setShowDuplicateDialog(false);

    importPlayersMutation.mutate({
      players: mappedPlayers,
      dedupe: dedupeState
        ? { decisions: dedupeDecisions, summary: dedupeState.summary }
        : null,
    });
  }, [dedupeDecisions, dedupeState, importPlayersMutation, mappedPlayers]);

  useEffect(() => {
    if (!IMPORT_DEDUP_ENABLED) return;

    if (mappedPlayers.length > 0) {
      void runDedupe(mappedPlayers, { allowMerge: !replaceExisting });
    } else if (replaceExisting) {
      setShowDuplicateDialog(false);
      setDedupeReviewed(true);
    }
  }, [mappedPlayers, replaceExisting, runDedupe]);

  // Track dirty state when mapped players exist
  useEffect(() => {
    setDirty('import', mappedPlayers.length > 0);
  }, [mappedPlayers.length, setDirty]);

  useEffect(() => {
    if (mappedPlayers.length === 0) {
      setTieRankReport(null);
      setShowTieRankDetails(false);
      setDobImputationReport(null);
      setShowDobImputationDetails(false);
    }
  }, [mappedPlayers.length]);

  // Fetch categories to check for female/girl categories
  const { data: categories } = useQuery({
    queryKey: ['categories', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('categories')
        .select('name, criteria_json')
        .eq('tournament_id', id)
        .eq('is_active', true);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  // Compute whether tournament has female/girl categories
  const hasFemaleCategories = useMemo(() => {
    return checkHasFemaleCategories(categories as Parameters<typeof checkHasFemaleCategories>[0]);
  }, [categories]);

  // Compute which extra fields are used by prize category rules
  const ruleUsedFields = useMemo(() => {
    return extractRuleUsedFields(categories as Parameters<typeof extractRuleUsedFields>[0]);
  }, [categories]);

  /**
   * Determine if an extra field should be shown in the preview table.
   * Shows the field ONLY if it's required by prize category rules (criteria_json).
   * This helps organizers validate only the fields that affect allocation.
   */
  const shouldShowPreviewField = useCallback(
    (fieldName: string): boolean => ruleUsedFields.has(fieldName),
    [ruleUsedFields]
  );

  const isOrganizer = !!isMaster || (tournament && user && tournament.owner_id === user.id);
  const tournamentSlug = (tournament as { slug?: string } | null | undefined)?.slug ?? 'tournament';

  const handleDownloadConflicts = useCallback(() => {
    if (conflicts.length === 0) {
      toast.info('No conflicts to export');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const filename = `${tournamentSlug}_conflicts_${today}.xlsx`;
    console.log('[conflict.export]', { rows: conflicts.length, filename });
    try {
      const ok = downloadConflictsXlsx(conflicts, filename);
      if (ok) {
        toast.success(`Conflicts workbook downloaded (${conflicts.length} rows)`);
      } else {
        toast.info('Conflicts workbook not generated');
      }
    } catch (error) {
      console.error('[conflict.export] failed', error);
      toast.error('Failed to export conflicts workbook');
    }
  }, [conflicts, tournamentSlug]);

  // NEW: Fetch existing players for duplicate/conflict detection
  const { data: existingPlayers } = useQuery({
    queryKey: ['players', id],
    queryFn: async () => {
      if (!id) return [];
      
      const { data, count, usedColumns } = await safeSelectPlayersByTournament(
        id,
        ['id', 'name', 'dob', 'rating', 'fide_id', 'gender', 'sno', 'rank']
      );
      
      console.log('[import] Loaded existing players for dedup/replace', { 
        count, 
        usedColumns,
        hasFideId: usedColumns.includes('fide_id'),
        hasSno: usedColumns.includes('sno')
      });
      
      // Non-blocking info if schema is missing columns
      if (!usedColumns.includes('fide_id') || !usedColumns.includes('sno')) {
        const missing = [];
        if (!usedColumns.includes('fide_id')) missing.push('fide_id');
        if (!usedColumns.includes('sno')) missing.push('sno');
        console.info(`[import] ℹ️  Legacy schema detected (missing: ${missing.join(', ')}). Import will work without these columns.`);
      }
      
      return data;
    },
    enabled: IMPORT_DEDUP_ENABLED && !!id,
  });

  useEffect(() => {
    if (IMPORT_DEDUP_ENABLED && existingPlayers) {
      console.log('[import] Loaded', existingPlayers.length, 'existing players');
      // Filter and cast: id and name are always selected
      const validPlayers = existingPlayers
        .filter((p): p is typeof p & { id: string; name: string } => !!p.id && !!p.name);
      setDbPlayers(validPlayers);
    } else if (!IMPORT_DEDUP_ENABLED) {
      setDbPlayers([]);
    }
  }, [existingPlayers]);

  useEffect(() => {
    hasMappedRef.current = false;
  }, [headers, parsedData]);

  useEffect(() => {
    if (mappedPlayers.length === 0) {
      setAutoFilledRankCount(0);
    }
  }, [mappedPlayers.length]);

  useEffect(() => {
    if (!replaceExisting) {
      setReplaceBanner(null);
    }
  }, [replaceExisting]);

  useEffect(() => {
    if (headers.length === 0) {
      setImportSource('unknown');
      lastFileInfoRef.current = {
        ...lastFileInfoRef.current,
        source: 'unknown'
      };
      return;
    }

    const detectedSource = inferImportSource(
      headers,
      parsedData as Record<string, unknown>[]
    );
    lastFileInfoRef.current = {
      ...lastFileInfoRef.current,
      source: detectedSource
    };
    setImportSource(detectedSource === 'organizer-template' ? 'template' : detectedSource);
  }, [headers, parsedData]);

  // NEW: Check for autosave draft on mount
  useEffect(() => {
    if (mappedPlayers.length > 0) return; // Don't overwrite existing work
    const draft = getDraft<{
      mappedPlayers: ParsedPlayer[];
      conflicts: ConflictPair[];
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

  useEffect(() => {
    if (typeof window === 'undefined' || !conflictStorageKey) return;
    try {
      const raw = window.localStorage.getItem(conflictStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, 'keepA' | 'keepB' | 'merge' | 'keepBoth'>;
      setConflictResolutions(prev => {
        const keys = Object.keys(parsed);
        if (
          keys.length === Object.keys(prev).length &&
          keys.every(key => prev[key] === parsed[key as keyof typeof parsed])
        ) {
          return prev;
        }
        return parsed;
      });
    } catch (err) {
      console.warn('[conflict.review] failed to load stored resolutions', err);
    }
  }, [conflictStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || !conflictStorageKey) return;
    if (conflicts.length === 0) {
      window.localStorage.removeItem(conflictStorageKey);
      return;
    }
    try {
      window.localStorage.setItem(conflictStorageKey, JSON.stringify(conflictResolutions));
    } catch (err) {
      console.warn('[conflict.review] failed to persist resolutions', err);
    }
  }, [conflictResolutions, conflictStorageKey, conflicts.length]);

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
    setConflicts([]);
    setConflictResolutions({});
    setFileHash(null);
    setDedupeState(null);
    setDedupeDecisions([]);
    setShowDuplicateDialog(false);
    setDedupeReviewed(false);
    setParseError(null);
    setParseStatus('idle');
    setReplaceBanner(null);
    setImportErrorBanner(null);
    setFullNameMissingBanner(false);
    setShowMappingDialog(false);
    setIsParsing(false);
    setLastParseMode(null);
    setImportSource('unknown');
    setDataCoverage(null);
    setFemaleCountSummary(null);
    resetDirty('import');

    genderConfigRef.current = null;

    // Also clear file input so the same file can be picked again
    const input = document.getElementById('players-file-input') as HTMLInputElement | null;
    if (input) input.value = '';
    
    hasMappedRef.current = false; // Reset at end
    toast.info('Import reset — you can choose a file again.');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    hasMappedRef.current = false; // Reset at start of file select
    
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
    setConflicts([]);
    setConflictResolutions({});
    setParseStatus('idle');
    setDedupeState(null);
    setDedupeDecisions([]);
    setShowDuplicateDialog(false);
    setDedupeReviewed(false);
    setReplaceBanner(null);
    setImportErrorBanner(null);
    setFullNameMissingBanner(false);
    setDataCoverage(null);
    setFemaleCountSummary(null);

    toast.info(`Uploading ${selectedFile.name}...`);

    setIsParsing(true);
    setImportSource('unknown');
    setLastParseMode(null);

    genderConfigRef.current = null;

    try {
      logContextRef.current = null;
      lastFileInfoRef.current = {
        name: selectedFile.name ?? null,
        hash: null,
        sheetName: null,
        headerRow: null,
        source: 'unknown'
      };

      const result = await parseFile(selectedFile, {
        forceServer: importConfig.preferServer,
        tournamentId: id ?? undefined
      });
      const {
        data,
        headers: detectedHeaders,
        sheetName,
        headerRow,
        fileHash,
        mode,
        source,
        fallback,
        genderConfig: serverGenderConfig
      } = result;
      setLastParseMode(mode);
      setParsedData(data);
      setHeaders(detectedHeaders);
      setParseError(null); // Clear any previous error
      setParseStatus('ok');

      // Use server's genderConfig if available (more reliable - scans full dataset)
      // Fall back to local analysis only if server didn't provide config
      if (serverGenderConfig && mode === 'server') {
        genderConfigRef.current = serverGenderConfig as import("@/utils/genderInference").GenderColumnConfig;
        console.log('[import.gender] Using server-provided genderConfig:', serverGenderConfig);
      } else {
        genderConfigRef.current = data?.length
          ? analyzeGenderColumns(data as Record<string, unknown>[])
          : null;
        console.log('[import.gender] Using local genderConfig analysis:', genderConfigRef.current);
      }

      if (fallback === 'server-error') {
        toast.error('Server parsing failed. Local parser used instead.');
      } else if (fallback === 'local-error') {
        toast.info('Local parser failed. Parsed on server instead.');
      } else if (fallback === 'local-timeout') {
        toast.info('Local parsing timed out. Parsed on server instead.');
      }

      lastFileInfoRef.current = {
        ...lastFileInfoRef.current,
        hash: fileHash ?? null,
        sheetName: sheetName ?? null,
        headerRow: headerRow ?? null,
        source: source ?? 'unknown'
      };
      setFileHash(fileHash ?? null);

      if (source) {
        setImportSource(source === 'organizer-template' ? 'template' : source);
      }

      if (data?.length) {
        console.log('[import] Detected headers:', detectedHeaders);
        console.log('[import] Parsed', data.length, 'data rows');
      }
      // Auto-mapping will be handled by useEffect below
    } catch (error) {
      console.error('[parseFile]', error);
      const errMsg = error instanceof Error ? error.message : "Failed to parse file. Please upload an Excel file (.xls or .xlsx).";
      setParseError(errMsg);
      toast.error(errMsg);
      setParseStatus('error');
      setLastParseMode(null);
      setFileHash(null);
    } finally {
      setIsParsing(false);
      // Reset file input to allow re-uploading same filename
      if (e?.target && 'value' in e.target) {
        (e.target as HTMLInputElement).value = '';
      }
    }
  };

  // Helper: Consider footer rows as non-data when both rank and name are missing/empty
  const isFooterRow = useCallback((p: Record<string, unknown>) => {
    const r = p?.rank;
    const n = (p?.name ?? '').toString().trim();
    return (r == null || r === '' || Number.isNaN(Number(r))) && n.length === 0;
  }, []);

  const handleMappingConfirm = useCallback(async (mapping: Record<string, string>) => {
    setShowMappingDialog(false);

    const preset = selectPresetBySource(importSource as 'organizer-template' | 'swiss-manager' | 'unknown');
    
    // Track zero ratings before coercion
    let zeroRatingCount = 0;
    const primaryNameHeader = nameHeaderCandidates[0] ?? null;
    const selectedNameHeader = mapping.name && nameHeaderCandidates.includes(mapping.name)
      ? mapping.name
      : primaryNameHeader;
    const alternateNameHeader = nameHeaderCandidates.find(header => header !== selectedNameHeader) ?? null;
    const shouldAutofillFullName = !mapping.full_name
      && Boolean(mapping.name)
      && nameHeaderCandidates.includes(String(mapping.name));

    // Map data with Phase 6 value normalization
    const mapped: ParsedPlayer[] = parsedData.map((row, idx) => {
      const player: Record<string, unknown> = { _originalIndex: idx + 1 };

      Object.keys(mapping).forEach((fieldKey) => {
        const col = mapping[fieldKey];
        let value = row[col];

        // Phase 6: Apply value normalizers
        if (fieldKey === 'rank') {
          value = normalizeRankValue(value);
        } else if (fieldKey === 'sno') {
          value = value ? Number(value) : null;
        } else if (fieldKey === 'rating') {
          // Track zeros before coercion
          if (String(value ?? '').trim() === '0') {
            zeroRatingCount++;
          }
          // Apply rating normalizer with comma stripping config
          value = normalizeRating(value, importConfig.stripCommasFromRating);
        } else if (fieldKey === 'gender') {
          // Preserve raw gender value for inference without pre-normalizing
          player._rawGender = value;
          return;
        } else if (fieldKey === 'federation' || fieldKey === 'fed_code') {
          // Map both federation and fed_code to the federation field
          player.federation = value ? String(value).trim() || null : null;
          return; // Skip default assignment below
        } else if (fieldKey === 'dob' && value != null && value !== '') {
          const result = toISODate(value);
          player.dob = result.dob;
          player.dob_original = result.dob_original;
          player.dob_raw = result.dob_original;
          player.dob_was_imputed_from_year = result.wasImputedFromYear;
          player._dobInferred = result.inferred;
          player._dobInferredReason = result.inferredReason;
          return; // Skip setting value below since we handled it
        } else if (fieldKey === 'fide_id' && value != null) {
          value = toNumericFideOrNull(value);
        } else if (fieldKey === 'unrated') {
          // Store raw unrated value for inference
          player._rawUnrated = value;
          return; // Will infer after all fields mapped
        } else if (typeof value === 'string') {
          value = value.trim() || null;
        }

        player[fieldKey] = value;
      });

      // Apply preset field-specific normalizers (if any)
      if (preset?.normalizers?.length) {
        for (const n of preset.normalizers) {
          if (n.field in player) {
            player[n.field] = n.normalize(player[n.field], player);
          }
        }
      }

      // Phase 6.5: Auto-extract state from Ident column if state is missing
      // Swiss-Manager often has Ident format: IND/KA/10203 where KA is the state code
      // IMPORTANT: Never use federation as fallback for state
      if ((!player.state || player.state === '') && player.federation !== 'IND') {
        // Check if we have an 'ident' field mapped or can find it in raw data
        let identValue = player.ident;
        if (!identValue) {
          // Try to find Ident column from original row data
          const identColCandidates = ['Ident', 'ident', 'IDENT', 'Player-ID', 'ID'];
          for (const col of identColCandidates) {
            if (row[col] != null && row[col] !== '') {
              identValue = row[col];
              player.ident = identValue; // Store for reference
              break;
            }
          }
        }
        
        if (identValue) {
          const extractedState = extractStateFromIdent(String(identValue));
          if (extractedState) {
            player.state = extractedState;
            player._stateAutoExtracted = true;
            logImportDebug('[import.state] Auto-extracted state from ident', {
              row: idx + 1,
              state: extractedState,
              ident: maskImportValue(identValue),
            });
          }
        }
      }

      // Phase 6: Infer unrated flag after all fields mapped
      player.unrated = inferUnrated(
        {
          rating: player.rating as number | null | undefined,
          fide_id: player.fide_id as string | null | undefined,
          unrated: player._rawUnrated
        },
        {
          treatEmptyAsUnrated: importConfig.treatEmptyAsUnrated,
          inferFromMissingRating: importConfig.inferUnratedFromMissingData
        }
      );

      // Extract Gr and Type columns - check both mapping and direct row access
      const grValue = mapping.gr ? row[mapping.gr] : (row['Gr'] ?? row['gr'] ?? player.gr);
      const grInfo = normalizeGrColumn(grValue);
      const typeValue = mapping.type ? row[mapping.type] : (row['Type'] ?? row['type'] ?? player.type);
      const typeLabel = normalizeTypeColumn(typeValue);

      // Debug: log first few PC players to verify mapping
      if (grInfo.group_label?.toUpperCase() === 'PC' && idx < 5) {
        logImportDebug('[import.gr] PC player detected', {
          row: idx + 1,
          rank: player.rank ?? null,
          name: maskImportValue(player.full_name ?? player.name),
          gr_value: maskImportValue(grValue),
          group_label: grInfo.group_label ?? null,
        });
      }

      player.group_label = grInfo.group_label;
      player.type_label = typeLabel;

      // Prioritize server's pre-computed gender if available (more reliable - scans full dataset)
      // Server adds _gender, _gender_source, _genderSources, _genderWarnings to each row
      const rowRecord = row as Record<string, unknown>;
      const serverGender = rowRecord._gender as string | null | undefined;
      const serverGenderSource = rowRecord._gender_source as string | null | undefined;
      const serverGenderSources = rowRecord._genderSources as string[] | undefined;
      const serverGenderWarnings = rowRecord._genderWarnings as string[] | undefined;
      
      if (serverGender !== undefined) {
        // Use server's pre-computed gender
        if (serverGender !== null) {
          player.gender = serverGender as 'M' | 'F';
        }
        if (serverGenderSource) {
          (player as Record<string, unknown>).gender_source = serverGenderSource;
        }
        if (serverGenderSources?.length) {
          player._genderSources = serverGenderSources as import("@/utils/genderInference").GenderSource[];
        }
        if (serverGenderWarnings?.length) {
          player._genderWarnings = serverGenderWarnings;
        }
      } else {
        // Fall back to local inference
        const genderInference = inferGenderForRow(
          rowRecord,
          genderConfigRef.current,
          typeLabel,
          grInfo.group_label
        );

        if (genderInference.gender !== null) {
          player.gender = genderInference.gender;
        }

        if (genderInference.gender_source) {
          (player as Record<string, unknown>).gender_source = genderInference.gender_source;
        }

        if (genderInference.sources.length) {
          player._genderSources = genderInference.sources;
        }

        if (genderInference.warnings.length) {
          player._genderWarnings = genderInference.warnings;
        }
      }

      return player as ParsedPlayer;
    })
    // Filter out footer rows (no rank & no name)
    .filter(p => !isFooterRow(p));

    if (shouldAutofillFullName) {
      mapped.forEach(player => {
        if (!player.full_name && player.name) {
          player.full_name = player.name;
        }
      });
    }

    const tieRankResult = imputeContinuousRanksFromTies(mapped, {
      rankKey: "rank",
      rowNumberKey: "_originalIndex"
    });
    setTieRankReport(tieRankResult.report);

    fillSingleGapRanksInPlace(mapped);

    // Phase 6b: Auto-fill missing ranks for named rows after preserving existing numbers
    const rowsWithNames = mapped.filter(player => String(player.full_name ?? player.name ?? '').trim().length > 0);
    const maxRank = rowsWithNames.reduce((max, player) => {
      const rankNum = Number(player.rank);
      return Number.isFinite(rankNum) && rankNum >= 1 ? Math.max(max, rankNum) : max;
    }, 0);

    let nextRank = maxRank + 1;
    rowsWithNames.forEach(player => {
      const rankNum = Number(player.rank);
      if (player.rank == null || Number.isNaN(rankNum)) {
        player.rank = nextRank++;
        player._rank_autofilled = true;
      }
    });
    const autofilledCount = mapped.filter(player => player._rank_autofilled).length;
    setAutoFilledRankCount(autofilledCount);
    if (autofilledCount > 0) {
      console.info(`[import] auto-filled ${autofilledCount} rank gaps`);
      toast.info(`${autofilledCount} ranks auto-filled based on neighbors`);
    }

    // Count auto-extracted states
    const autoExtractedStateCount = mapped.filter(player => player._stateAutoExtracted).length;
    setStatesExtractedCount(autoExtractedStateCount);
    if (autoExtractedStateCount > 0) {
      console.info(`[import.state] Auto-extracted ${autoExtractedStateCount} state codes from Ident column`);
      toast.info(`${autoExtractedStateCount} state codes auto-extracted from Ident column`);
    }

    const dobImputedRows = mapped
      .filter(player => player.dob_was_imputed_from_year)
      .map(player => ({
        rowNumber: player._originalIndex,
        rank: Number.isFinite(Number(player.rank)) ? Number(player.rank) : null,
        dob_original: player.dob_original ?? player.dob_raw ?? null,
        dob_saved: player.dob ?? null
      }));

    setDobImputationReport(
      dobImputedRows.length > 0
        ? { totalImputed: dobImputedRows.length, rows: dobImputedRows }
        : null
    );
    setShowDobImputationDetails(false);

    // Phase 5: Validate with detailed breakdown
    const errors: { row: number; errors: string[] }[] = [];
    const validPlayers: ParsedPlayer[] = [];
    const skippedBreakdown: Record<string, { count: number; sample: string[] }> = {};

    mapped.forEach(player => {
      const result = playerImportSchema.safeParse(player);
      if (result.success) {
        validPlayers.push(player);
      } else {
        // Categorize errors for transparency
        result.error.errors.forEach(e => {
          const fieldName = String(e.path[0] || 'unknown');
          const reason = `${fieldName}: ${e.message}`;
          
          if (!skippedBreakdown[reason]) {
            skippedBreakdown[reason] = { count: 0, sample: [] };
          }
          skippedBreakdown[reason].count++;
          
          // Collect sample rows (max 3 per reason)
          if (skippedBreakdown[reason].sample.length < 3) {
            skippedBreakdown[reason].sample.push(`Row ${player._originalIndex}`);
          }
        });
        
        errors.push({
          row: player._originalIndex,
          errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        });
      }
    });

    // Phase 5: Log validation summary with top reasons
    const topReasons = Object.entries(skippedBreakdown)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10);

    console.log(`[validate] total=${mapped.length} valid=${validPlayers.length} skipped=${errors.length}`);
    if (topReasons.length > 0) {
      const summary = topReasons
        .slice(0, 3)
        .map(([reason, data]) => {
          const sample = data.sample[0] ? ` e.g. ${data.sample[0]}` : '';
          return `${reason} (${data.count})${sample}`;
        })
        .join('; ');
      console.log('[import] top reasons:', summary);
    } else {
      console.log('[import] top reasons: none');
    }

    logContextRef.current = {
      totalRows: mapped.length,
      acceptedRows: validPlayers.length,
      skippedRows: errors.length,
      topReasons: topReasons.map(([reason, data]) => ({
        reason,
        count: data.count
      })),
      sampleErrors: errors.slice(0, 10).map(err => ({
        row: err.row,
        errors: err.errors.slice(0, 3)
      }))
    };

    // Calculate data coverage for quality checks
    const totalValid = validPlayers.length;
    setFemaleCountSummary(null);
    if (totalValid > 0) {
      const coverage = {
        dob: validPlayers.filter(p => p.dob).length / totalValid,
        gender: validPlayers.filter(p => p.gender).length / totalValid,
        state: validPlayers.filter(p => p.state).length / totalValid,
        city: validPlayers.filter(p => p.city).length / totalValid,
        federation: validPlayers.filter(p => p.federation).length / totalValid,
      };
      setDataCoverage(coverage);

      // Check full_name coverage - show banner if mostly missing
      const fullNameCount = validPlayers.filter(p => p.full_name).length;
      const fullNameCoverage = fullNameCount / totalValid;
      const rawRows = parsedData as Record<string, unknown>[];
      const selectedNameStats = selectedNameHeader
        ? getNameColumnStats(rawRows, selectedNameHeader)
        : null;
      const alternateNameStats = alternateNameHeader
        ? getNameColumnStats(rawRows, alternateNameHeader)
        : null;
      const abbreviatedNameEvidence = hasAbbreviatedNameEvidence(selectedNameStats);
      const alternateLooksFuller = looksFullerThan(alternateNameStats, selectedNameStats);
      const fullNameMappedElsewhere = Boolean(mapping.full_name && mapping.full_name !== mapping.name);
      const shouldShowFullNameWarning =
        totalValid >= 5
        && !fullNameMappedElsewhere
        && abbreviatedNameEvidence
        && alternateLooksFuller;
      if (shouldShowFullNameWarning) {
        setFullNameMissingBanner(true);
        console.log('[import.coverage] Full names mostly missing', {
          fullNameCount,
          totalValid,
          fullNameCoverage,
          selectedNameHeader,
          alternateNameHeader,
          abbreviatedNameEvidence,
          alternateLooksFuller,
        });
      } else {
        setFullNameMissingBanner(false);
      }

      const femaleFromGender = validPlayers.filter(p => String(p.gender ?? '').trim().toUpperCase() === 'F').length;
      const maleFromGender = validPlayers.filter(p => String(p.gender ?? '').trim().toUpperCase() === 'M').length;
      let hasFemaleTypeLabel = false;
      let hasFemaleGroupLabel = false;
      const femaleFromFmg = validPlayers.filter(p => {
        const pAny = p as ParsedPlayer;
        const typeLabel = String(pAny.type_label ?? pAny.type ?? '').trim();
        const groupLabel = String(pAny.group_label ?? pAny.gr ?? '').trim();
        const typeFemale = hasFemaleMarker(typeLabel);
        const groupFemale = hasFemaleMarker(groupLabel);
        if (typeFemale) hasFemaleTypeLabel = true;
        if (groupFemale) hasFemaleGroupLabel = true;
        return typeFemale || groupFemale;
      }).length;
      
      // Determine gender sources from config
      const genderSources: import("@/utils/genderInference").GenderSource[] = [];
      const config = genderConfigRef.current;
      if (config?.preferredSource) {
        genderSources.push(config.preferredSource);
      }
      if (femaleFromFmg > 0) {
        if (hasFemaleTypeLabel) genderSources.push('type_label');
        if (hasFemaleGroupLabel) genderSources.push('group_label');
      }
      
      setFemaleCountSummary({ femaleFromGender, femaleFromFmg, maleFromGender, genderSources });

      // Check if state looks like federation (IND, IN, INDIA)
      const stateIndCount = validPlayers.filter(p => 
        p.state && ['IND', 'IN', 'INDIA'].includes(String(p.state).toUpperCase())
      ).length;
      const stateIndPct = stateIndCount / totalValid;

      if (stateIndPct >= 0.8) {
        toast.warning(
          "Heads up: 'State' looks like Federation (IND) for most rows. " +
          "Check your mapping: use 'Fed.' for Federation and 'Ident/State' for State.",
          { duration: 8000 }
        );
        console.warn('[import.coverage] State appears to contain federation codes', {
          stateIndCount,
          totalValid,
          percentage: (stateIndPct * 100).toFixed(1) + '%'
        });
      }
      
      // Rating coverage telemetry
      const ratingStats = {
        null: validPlayers.filter(p => p.rating == null).length,
        gt0: validPlayers.filter(p => p.rating != null && p.rating > 0).length,
        zero_coerced: zeroRatingCount,
        total: totalValid
      };
      console.log('[import.coverage] ratings:', ratingStats);
    } else {
      setDataCoverage(null);
    }

    setValidationErrors(errors);

    // Phase 5: Show detailed error message if no valid rows
    if (validPlayers.length === 0 && mapped.length > 0) {
      const msg = topReasons.length > 0
        ? `No valid rows after mapping. Top issues:\n${topReasons.slice(0, 3).map(([r, d]) => `• ${r}: ${d.count} rows`).join('\n')}`
        : 'No valid rows after mapping. Check column mapping and data format.';
      
      setParseError(msg);
      setParseStatus('error');
      toast.error(msg, { duration: 8000 });
      
      showError({
        title: 'Import Validation Failed',
        message: msg,
        hint: 'Download error report for full details. Verify columns are correctly mapped.'
      });
      return;
    }

    console.log('[conflict.input]', {
      draftRows: validPlayers.length,
      dbRows: replaceExisting ? 0 : (existingPlayers?.length ?? 0),
      replaceMode: replaceExisting === true
    });

    console.log('[conflict.policy]', {
      keys: ['fide', 'nameDob', 'sno'],
      ignoreRankOnly: true
    });

    const intraConflicts = detectConflictsInDraft(validPlayers);
    let detectedConflicts: ConflictPair[] = [];

    if (replaceExisting) {
      console.log('[conflict.scope] replace-mode → intra-file only');
      detectedConflicts = intraConflicts;
    } else if (id) {
      console.log('[conflict.scope] append-mode → draft + DB');
      const appendConflicts = await detectAppendModeConflicts(validPlayers, id);
      detectedConflicts = [...intraConflicts, ...appendConflicts];
    } else {
      detectedConflicts = intraConflicts;
    }

    console.log('[conflict.counts]', {
      total: detectedConflicts.length,
      byFide: detectedConflicts.filter(c => c.keyKind === 'fide').length,
      byNameDob: detectedConflicts.filter(c => c.keyKind === 'nameDob').length,
      bySno: detectedConflicts.filter(c => c.keyKind === 'sno').length
    });

    console.log(
      '[conflict.samples]',
      detectedConflicts.slice(0, 3).map(conflict => ({
        keyKind: conflict.keyKind,
        aRow: getConflictRowIndex(conflict.a),
        bRow: getConflictRowIndex(conflict.b),
      })),
    );

    setConflicts(detectedConflicts);
    setConflictResolutions(prev => {
      const next: Record<string, 'keepA' | 'keepB' | 'merge' | 'keepBoth'> = {};
      detectedConflicts.forEach((pair, index) => {
        const key = conflictKeyForIndex(pair, index);
        if (prev[key]) {
          next[key] = prev[key];
        }
      });
      return next;
    });
    setDuplicates([]);
    
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
    await runDedupe(valid, { autoOpen: true });

    // Set parseStatus - conflicts are separate resolvable state, not errors
    // Only treat validation errors as actual parse errors
    if (errors.length === 0) {
      if (detectedConflicts.length === 0) {
        toast.success(`${valid.length} players ready to import`);
      } else {
        toast.info(`${valid.length} players mapped. ${detectedConflicts.length} conflict${detectedConflicts.length === 1 ? '' : 's'} to resolve.`);
      }
      setParseStatus('ok');
    } else {
      setParseStatus('error');
    }
  }, [
    existingPlayers,
    genderConfigRef,
    id,
    importConfig,
    importSource,
    isFooterRow,
    nameHeaderCandidates,
    parsedData,
    replaceExisting,
    runDedupe,
    showError,
  ]);

  // Auto-mapping useEffect - runs AFTER headers state is committed
  useEffect(() => {
    if (headers.length === 0 || parsedData.length === 0) return;
    if (hasMappedRef.current) return;

    hasMappedRef.current = true;

    console.log('[import] Running auto-mapping with', headers.length, 'headers');

    const autoMapping: Record<string, string> = {};
    const normalizedAliases: Record<string, string[]> = {};
    
    // Determine best name column: use detectFullVsAbbrevName when 2+ Name columns exist
    let primaryNameHeader = nameHeaderCandidates[0];
    if (nameHeaderCandidates.length >= 2) {
      const detection = detectFullVsAbbrevName(
        parsedData as Record<string, unknown>[],
        nameHeaderCandidates[0],
        nameHeaderCandidates[1]
      );
      if (detection) {
        primaryNameHeader = detection.fullNameColumn;
        console.log('[import] name column pick', {
          candidates: nameHeaderCandidates,
          chosen: primaryNameHeader,
          detection
        });
      } else {
        console.log('[import] name column pick', {
          candidates: nameHeaderCandidates,
          chosen: primaryNameHeader,
          detection: 'inconclusive - using first'
        });
      }
    } else if (nameHeaderCandidates.length === 1) {
      console.log('[import] name column pick', {
        candidates: nameHeaderCandidates,
        chosen: primaryNameHeader,
        detection: 'single candidate'
      });
    }

    const genderConfig = genderConfigRef.current;
    const genderCandidate = genderConfig?.preferredColumn;
    if (genderCandidate && !GENDER_DENYLIST.has(normalizeHeaderForMatching(genderCandidate))) {
      autoMapping.gender = genderCandidate;
      if (genderConfig?.preferredSource === 'headerless_after_name') {
        console.log("[import] gender source: headerless column after Name (not 'fs')");
      }
    }

    if (isFeatureEnabled('RATING_PRIORITY')) {
      const bestRating = selectBestRatingColumn(headers);
      if (bestRating) {
        autoMapping.rating = bestRating;
      }
    }

    Object.entries(HEADER_ALIASES).forEach(([field, aliases]) => {
      normalizedAliases[field] = aliases.map(normalizeHeaderForMatching);
    });

    headers.forEach(h => {
      const normalized = normalizeHeaderForMatching(h);
      for (const [field, aliases] of Object.entries(normalizedAliases)) {
        if (!autoMapping[field] && aliases.includes(normalized)) {
          if (field === 'name' && primaryNameHeader) {
            break;
          }
          autoMapping[field] = h;
          break;
        }
      }
    });

    if (primaryNameHeader) {
      autoMapping.name = primaryNameHeader;
      if (!autoMapping.full_name) {
        autoMapping.full_name = primaryNameHeader;
      }
    }

    if (!autoMapping.name && autoMapping.full_name) {
      autoMapping.name = autoMapping.full_name;
    }

    console.log('[import] Auto-mapped fields:', autoMapping);
    console.log('[import] Mapped field count:', Object.keys(autoMapping).length);

    if (!autoMapping.rank || !autoMapping.name) {
      console.warn('[import] Missing required fields:', {
        rank: !autoMapping.rank,
        name: !autoMapping.name
      });
      setShowMappingDialog(true);
      toast.warning('Please map required fields: Rank and Name');
    } else {
      console.log('[import] Auto-mapping successful');
      setShowMappingDialog(false);
      void handleMappingConfirm(autoMapping);
      toast.info('Columns auto-mapped successfully');
    }
  }, [headers, parsedData, handleMappingConfirm]);

  // Register Cmd/Ctrl+S
  const { registerOnSave } = useDirty();

  useEffect(() => {
    const ready =
      mappedPlayers.length > 0 &&
      validationErrors.length === 0 &&
      unresolvedCount === 0 &&
      !importPlayersMutation.isPending;

    if (ready) {
      registerOnSave(async () => {
        console.log('[shortcut] importing players');
        startImportFlow();
      });
    } else {
      registerOnSave(null);
    }

    return () => registerOnSave(null);
  }, [
    mappedPlayers,
    validationErrors,
    unresolvedCount,
    importPlayersMutation.isPending,
    registerOnSave,
    startImportFlow,
  ]);

  const applyFullNameFromName = useCallback(() => {
    setMappedPlayers(prev =>
      prev.map(player => {
        if (player.full_name && String(player.full_name).trim() !== '') {
          return player;
        }
        const nameValue = player.name;
        if (!nameValue || String(nameValue).trim() === '') {
          return player;
        }
        return { ...player, full_name: nameValue };
      })
    );
    setFullNameMissingBanner(false);
    toast.success('Full Name set from Name');
  }, []);

  const hasData = mappedPlayers.length > 0;
  const validationErrorCount = validationErrors.length;
  const hasValidationErrors = validationErrorCount > 0;
  const hasUnresolvedConflicts = conflicts.length > 0 && unresolvedCount > 0;
  const allConflictsResolved = conflicts.length === 0 || unresolvedCount === 0;
  const canProceed = parseStatus === 'ok' && mappedPlayers.length > 0 && validationErrorCount === 0 && allConflictsResolved;
  const imgSrc = `${import.meta.env.BASE_URL}help/swiss-manager/print-all-columns.png`;

  return (
    <div className="min-h-screen bg-background">
      <BackBar label="Back to Setup" to={`/t/${id}/setup`} />
      <AppNav />
      
      <div className="container mx-auto px-6 py-8 max-w-6xl">
        <TournamentProgressBreadcrumbs />
        
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Import Players</h1>
          <p className="text-muted-foreground">Upload Excel (.xlsx or .xls) file with player data. Required: rank, name. Optional: rating, dob, gender, state, city, club, disability, special_notes, fide_id.</p>
        </div>

        {id && isOrganizer && <ImportLogsPanel tournamentId={id} />}

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
                    setDedupeReviewed(false);
                    void runDedupe(importRestore.data.mappedPlayers, { autoOpen: true });
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

        {lastParseMode === 'server' && parseStatus === 'ok' && (
          <Alert className="mb-4 border-primary/30 bg-primary/10 text-primary">
            <AlertDescription>Parsed on server for speed/reliability.</AlertDescription>
          </Alert>
        )}

        {!hasData ? (
          <Card>
            <CardHeader><CardTitle>Upload Excel File</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {isOrganizer ? (
                <>
              <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
                <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Upload your Swiss-Manager XLS</h3>
                <p className="text-sm text-muted-foreground mb-1">
                  Header row auto-detects ~18; gender is the <strong>blank column after the second Name</strong>.
                </p>
                <p className="text-xs text-muted-foreground mb-6">
                  Excel file with columns: rank, name, rating, DOB, gender, state, city
                </p>

                <div className="flex items-center justify-center mb-4">
                  <button
                    type="button"
                    className="bg-yellow-300 text-black px-2 py-1 rounded-md font-medium hover:bg-yellow-200 transition-colors"
                    onClick={() => setShowSwissManagerTip(true)}
                  >
                    Swiss-Manager export tip: enable ‘Print all columns’
                  </button>
                </div>
                
                {/* Phase 6: Import Options - shown before upload */}
                <Card className="mb-6 text-left max-w-2xl mx-auto">
                  <CardHeader>
                    <CardTitle className="text-sm">Import Options</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {SERVER_IMPORT_ENABLED && (
                      <div className="flex items-center justify-between">
                        <Label htmlFor="prefer-server-pre" className="cursor-pointer">Parse on server when available</Label>
                        <Switch
                          id="prefer-server-pre"
                          checked={importConfig.preferServer}
                          onCheckedChange={(v) => setImportConfig(prev => ({ ...prev, preferServer: v }))}
                        />
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <Label htmlFor="strip-commas-pre" className="cursor-pointer">Strip commas from ratings</Label>
                      <Switch id="strip-commas-pre" checked={importConfig.stripCommasFromRating}
                        onCheckedChange={(v) => setImportConfig(prev => ({ ...prev, stripCommasFromRating: v }))} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="infer-unrated-pre" className="cursor-pointer">Infer unrated (rating=0, no FIDE ID)</Label>
                      <Switch id="infer-unrated-pre" checked={importConfig.inferUnratedFromMissingData}
                        onCheckedChange={(v) => setImportConfig(prev => ({ ...prev, inferUnratedFromMissingData: v }))} />
                    </div>
                  </CardContent>
                </Card>
                
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
            {CONFLICT_REVIEW_ENABLED && conflicts.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/80">
                <CardHeader>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-lg font-semibold text-foreground">
                        Conflict Review ({conflicts.length})
                      </CardTitle>
                      <span className={`text-sm font-medium ${unresolvedCount > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {unresolvedCount > 0 ? `${unresolvedCount} unresolved` : 'All conflicts resolved'}
                      </span>
                    </div>
                    <p className="text-sm text-amber-800">
                      Resolve each conflict before importing. Keep A keeps the first occurrence, Keep B keeps the incoming row, and Merge selects the richer record.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={handleAcceptFirstOccurrence}>
                        Accept all first occurrence
                      </Button>
                      <Button size="sm" variant="outline" onClick={handlePreferRichestRow}>
                        Prefer richest row
                      </Button>
                      <Button size="sm" variant="secondary" onClick={handleDownloadConflicts}>
                        Download Conflicts Excel (.xlsx)
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                {CONFLICT_ORDER.map(kind => {
                    const items = conflictGroups[kind];
                    if (!items || items.length === 0) return null;
                    
                    // Get appropriate icon for conflict type
                    const ConflictIcon = kind === 'fide' ? IdCard : kind === 'nameDob' ? Users : Hash;
                    
                    return (
                      <div key={kind} className="space-y-3">
                        <div className="flex items-center gap-2">
                          <ConflictIcon className="h-4 w-4 text-destructive" />
                          <h3 className="text-sm font-semibold text-foreground">
                            {CONFLICT_LABELS[kind]} Conflicts ({items.length})
                          </h3>
                        </div>
                        <div className="space-y-4">
                          {items.map(pair => {
                            const globalIndex = conflictIndexMap.get(pair) ?? 0;
                            const resolutionKey = conflictKeyForIndex(pair, globalIndex);
                            const selected = conflictResolutions[resolutionKey] ?? '';
                            const ItemIcon = pair.keyKind === 'fide' ? IdCard : pair.keyKind === 'nameDob' ? Users : Hash;
                            
                            return (
                              <div key={resolutionKey} className="rounded-md border-2 border-destructive/30 bg-destructive/5 p-4 shadow-sm">
                                <div className="flex flex-col gap-3">
                                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                    <div className="flex-1 space-y-3">
                                      <div>
                                        <p className="text-xs font-bold uppercase tracking-wide text-foreground">Existing / A</p>
                                        {renderConflictDetails(pair.a)}
                                      </div>
                                      <div>
                                        <p className="text-xs font-bold uppercase tracking-wide text-foreground">Incoming / B</p>
                                        {renderConflictDetails(pair.b)}
                                      </div>
                                    </div>
                                    <div className="flex flex-col gap-2 text-sm md:w-44">
                                      <label className="inline-flex items-center gap-2 cursor-pointer text-foreground">
                                        <input
                                          type="radio"
                                          name={`conflict-${resolutionKey}`}
                                          value="keepA"
                                          checked={selected === 'keepA'}
                                          onChange={() => updateResolution(resolutionKey, 'keepA')}
                                        />
                                        Keep A
                                      </label>
                                      <label className="inline-flex items-center gap-2 cursor-pointer text-foreground">
                                        <input
                                          type="radio"
                                          name={`conflict-${resolutionKey}`}
                                          value="keepB"
                                          checked={selected === 'keepB'}
                                          onChange={() => updateResolution(resolutionKey, 'keepB')}
                                        />
                                        Keep B
                                      </label>
                                      <label className="inline-flex items-center gap-2 cursor-pointer text-foreground">
                                        <input
                                          type="radio"
                                          name={`conflict-${resolutionKey}`}
                                          value="merge"
                                          checked={selected === 'merge'}
                                          onChange={() => updateResolution(resolutionKey, 'merge')}
                                        />
                                        Merge (richest)
                                      </label>
                                      <label className="inline-flex items-center gap-2 cursor-pointer text-primary font-medium">
                                        <input
                                          type="radio"
                                          name={`conflict-${resolutionKey}`}
                                          value="keepBoth"
                                          checked={selected === 'keepBoth'}
                                          onChange={() => updateResolution(resolutionKey, 'keepBoth')}
                                        />
                                        Keep both players
                                      </label>
                                    </div>
                                  </div>
                                  {/* Reason line with icon and high-contrast text */}
                                  <div className="flex items-start gap-2 mt-2 pt-3 border-t border-destructive/20 bg-background/50 -mx-4 -mb-4 px-4 py-3 rounded-b-md">
                                    <ItemIcon className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                                    <p className="text-sm font-medium text-foreground">
                                      {formatConflictReason(pair.keyKind, pair.key, pair.reason)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
            {tieRankReport?.totalImputed > 0 && mappedPlayers.length > 0 && (
              <Alert className="border-border bg-muted/50">
                <AlertTitle className="text-foreground">Tie ranks detected</AlertTitle>
                <AlertDescription className="flex flex-col gap-2 text-muted-foreground">
                  <span>
                    Tie ranks detected. We filled {tieRankReport.totalImputed} blank rank
                    {tieRankReport.totalImputed === 1 ? '' : 's'} into continuous ranks for prize allocation.
                  </span>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto w-fit p-0"
                    onClick={() => setShowTieRankDetails(true)}
                  >
                    View details
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {dobImputationReport?.totalImputed > 0 && mappedPlayers.length > 0 && (
              <Alert className="border-border bg-muted/50">
                <AlertTitle className="text-foreground">DOB year-only detected</AlertTitle>
                <AlertDescription className="flex flex-col gap-2 text-muted-foreground">
                  <span>
                    DOB year-only detected. Converted {dobImputationReport.totalImputed} value
                    {dobImputationReport.totalImputed === 1 ? '' : 's'} from YYYY/00/00 or YYYY to YYYY-01-01 for database compatibility.
                  </span>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto w-fit p-0"
                    onClick={() => setShowDobImputationDetails(true)}
                  >
                    View details
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {autoFilledRankCount > 0 && mappedPlayers.length > 0 && (
              <Alert className="border-border bg-muted/50">
                <AlertTitle className="text-foreground">Ranks auto-filled</AlertTitle>
                <AlertDescription className="text-muted-foreground">
                  {autoFilledRankCount} rank{autoFilledRankCount === 1 ? '' : 's'} were auto-filled based on
                  neighboring values. Please double-check before importing.
                </AlertDescription>
              </Alert>
            )}

            {importErrorBanner && (
              <Alert variant="destructive" className="border-destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Some players could not be imported</AlertTitle>
                <AlertDescription className="space-y-2">
                  <div>{importErrorBanner.message}</div>
                  {importErrorBanner.type === 'rank-conflict' && (
                    <div className="text-sm">
                      Please adjust their rank values in Excel and re-import, or use <strong>Replace mode</strong> to clear all existing players first.
                    </div>
                  )}
                  <div className="text-sm opacity-80">
                    An error workbook with the failed rows has been downloaded.
                  </div>
                </AlertDescription>
              </Alert>
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

            {mappedPlayers.length > 0 && (
              <ImportSummaryBar
                totalPlayers={mappedPlayers.length}
                validPlayers={Math.max(mappedPlayers.length - validationErrors.length, 0)}
                errorCount={validationErrors.length}
                statesExtracted={statesExtractedCount}
                femaleFromGender={femaleCountSummary?.femaleFromGender}
                femaleFromFmg={femaleCountSummary?.femaleFromFmg}
              />
            )}

            {dataCoverage && (
              <DataCoverageBar coverage={dataCoverage} />
            )}

            {/* Gender detection summary chip - always shown when players exist */}
            {mappedPlayers.length > 0 && femaleCountSummary && (
              <div className="flex items-center gap-2 flex-wrap">
                <GenderSummaryChip
                  femaleFromGender={femaleCountSummary.femaleFromGender}
                  maleFromGender={femaleCountSummary.maleFromGender}
                  femaleFromFmg={femaleCountSummary.femaleFromFmg}
                  sources={femaleCountSummary.genderSources}
                  totalPlayers={mappedPlayers.length}
                />
              </div>
            )}

            {/* Missing gender warning - shown when no females detected */}
            {mappedPlayers.length > 0 && femaleCountSummary && (
              <MissingGenderWarning
                femaleCount={femaleCountSummary.femaleFromGender + femaleCountSummary.femaleFromFmg}
                totalPlayers={mappedPlayers.length}
                hasFemaleCategories={hasFemaleCategories}
              />
            )}
            
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Preview ({mappedPlayers.length} players)</CardTitle>
                  <div className="flex items-center gap-3">
                    {canProceed && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            try {
                              const ok = downloadCleanedPlayersXlsx(mappedPlayers, tournamentSlug);
                              if (ok) {
                                toast.success('Cleaned Excel (.xlsx) downloaded');
                              }
                            } catch (err) {
                              const error = err as Error;
                              console.error('[export.xlsx] Cleaned export failed:', error);
                              toast.error('Failed to download cleaned Excel');
                            }
                          }}
                        >
                          Download Cleaned Excel (.xlsx)
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            try {
                              downloadPlayersXlsx(mappedPlayers, {
                                tournamentSlug,
                                importSource
                              });
                              toast.success('Players Excel (.xlsx) downloaded');
                            } catch (err) {
                              const error = err as Error;
                              console.error('[import] Players export failed:', error);
                              toast.error('Failed to download players Excel');
                            }
                          }}
                        >
                          Export Players (XLSX)
                        </Button>
                      </>
                    )}
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
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-auto max-h-96">
                  <Table role="table" aria-label="Player import preview">
                    <TableHeader>
                      <TableRow>
                        {/* Core columns: always visible */}
                        <TableHead scope="col">Rank</TableHead>
                        <TableHead scope="col">Name</TableHead>
                        <TableHead scope="col">Rating</TableHead>
                        <TableHead scope="col">DOB</TableHead>
                        <TableHead scope="col">Gender</TableHead>
                        {/* Extra columns: shown only if required by prize rules */}
                        {shouldShowPreviewField('state') && <TableHead scope="col">State</TableHead>}
                        {shouldShowPreviewField('city') && <TableHead scope="col">City</TableHead>}
                        {shouldShowPreviewField('club') && <TableHead scope="col">Club</TableHead>}
                        {shouldShowPreviewField('federation') && <TableHead scope="col">Federation</TableHead>}
                        {shouldShowPreviewField('disability') && <TableHead scope="col">Disability</TableHead>}
                        {shouldShowPreviewField('group_label') && <TableHead scope="col">Group</TableHead>}
                        {shouldShowPreviewField('type_label') && <TableHead scope="col">Type</TableHead>}
                        {/* FIDE ID always shown for reference */}
                        <TableHead scope="col">FIDE ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const rowsToShow = showAllRows ? mappedPlayers : mappedPlayers.slice(0, 10);
                        return rowsToShow.map((player, idx) => {
                          const hasConflict = conflicts.some(c => 
                            c.a?.rank === player.rank || c.b?.rank === player.rank
                          );
                          return (
                            <TableRow 
                              key={idx}
                              tabIndex={0}
                              aria-rowindex={idx + 1}
                              className={hasConflict ? 'bg-amber-50/50' : ''}
                            >
                              <TableCell>{player.rank ?? ''}</TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-2">
                                    {player.full_name ?? player.name ?? ''}
                                    {hasConflict && (
                                      <span className="text-xs text-amber-600" title="Conflict detected">⚠️</span>
                                    )}
                                  </div>
                                  <PlayerRowBadges
                                    stateAutoExtracted={Boolean(player._stateAutoExtracted)}
                                    extractedState={player.state}
                                    rankAutofilled={Boolean(player._rank_autofilled)}
                                  />
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
                              {/* Extra columns: shown only if required by prize rules */}
                              {shouldShowPreviewField('state') && <TableCell>{player.state ?? ''}</TableCell>}
                              {shouldShowPreviewField('city') && <TableCell>{player.city ?? ''}</TableCell>}
                              {shouldShowPreviewField('club') && <TableCell>{player.club ?? ''}</TableCell>}
                              {shouldShowPreviewField('federation') && <TableCell>{player.federation ?? ''}</TableCell>}
                              {shouldShowPreviewField('disability') && <TableCell>{player.disability ?? ''}</TableCell>}
                              {shouldShowPreviewField('group_label') && <TableCell>{player.group_label ?? ''}</TableCell>}
                              {shouldShowPreviewField('type_label') && <TableCell>{player.type_label ?? ''}</TableCell>}
                              {/* FIDE ID always shown */}
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
                  disabled={!hasValidationErrors}
                  onClick={async () => {
                    console.log('[import] error-xlsx requested', { errors: validationErrorCount });
                    const errorRows: ErrorRow[] = validationErrors.map(err => ({
                      rowIndex: err.row,
                      reason: err.errors.join('; '),
                    }));
                    const originals = parsedData as Record<string, unknown>[];
                    const today = new Date().toISOString().slice(0, 10);
                    const filename = `${tournamentSlug}_errors_${today}.xlsx`;
                    try {
                      const ok = await downloadErrorXlsx(errorRows, originals, filename);
                      if (ok) {
                        toast.success(`Error Excel downloaded (${validationErrorCount})`);
                      } else {
                        toast.info('No errors to download — all rows valid.');
                      }
                    } catch (err) {
                      console.error('[import] error-xlsx click failed', err);
                      toast.error('Failed to generate error file');
                    }
                  }}
                >
                  {hasValidationErrors ? `Download Error Excel (${validationErrorCount})` : 'No Errors'}
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
                    onChange={(e) => handleReplaceExistingChange(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <label htmlFor="replace-existing" className="text-sm cursor-pointer">
                    <span className="font-medium">Replace existing players for this tournament</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      Deletes existing players for this tournament before importing
                    </span>
                  </label>
                </div>
                {replaceExisting && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertTitle>Replace mode enabled</AlertTitle>
                    <AlertDescription>
                      This will delete all players for this tournament before inserting the new file.
                    </AlertDescription>
                  </Alert>
                )}
                {replaceBanner && (
                  <Alert
                    variant={replaceBanner.type === 'success' ? 'default' : 'destructive'}
                    className="mt-4"
                  >
                    <AlertTitle>
                      {replaceBanner.type === 'success' ? 'Players cleared' : 'Delete failed'}
                    </AlertTitle>
                    <AlertDescription>{replaceBanner.message}</AlertDescription>
                  </Alert>
                )}
                {fullNameMissingBanner && (
                  <Alert className="mt-4 border-amber-500 bg-amber-50 dark:bg-amber-950/20">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-700 dark:text-amber-400">Full names not detected</AlertTitle>
                    <AlertDescription className="text-amber-600 dark:text-amber-300">
                      If your sheet has two "Name" columns, map the longer one to <strong>Full Name</strong>.
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 h-auto ml-1 text-amber-700 dark:text-amber-400 underline"
                        onClick={applyFullNameFromName}
                      >
                        Set Full Name = Name
                      </Button>
                      <span className="mx-1">·</span>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 h-auto text-amber-700 dark:text-amber-400 underline"
                        onClick={() => setShowMappingDialog(true)}
                      >
                        Fix mapping
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
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
            
            {/* Import status and proceed section */}
            <Card className={`border-2 ${canProceed ? 'border-emerald-300 bg-emerald-50/50' : hasUnresolvedConflicts ? 'border-amber-300 bg-amber-50/50' : hasValidationErrors ? 'border-destructive/30 bg-destructive/5' : 'border-muted'}`}>
              <CardContent className="py-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {canProceed ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        <div>
                          <p className="font-medium text-foreground">
                            {conflicts.length > 0 
                              ? `All ${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'} resolved`
                              : 'Ready to import'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Click "Import players & continue" to proceed to allocation
                          </p>
                        </div>
                      </>
                    ) : hasUnresolvedConflicts ? (
                      <>
                        <AlertCircle className="h-5 w-5 text-amber-600" />
                        <div>
                          <p className="font-medium text-foreground">
                            {unresolvedCount} conflict{unresolvedCount === 1 ? '' : 's'} remaining
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Resolve all conflicts above to proceed
                          </p>
                        </div>
                      </>
                    ) : hasValidationErrors ? (
                      <>
                        <AlertCircle className="h-5 w-5 text-destructive" />
                        <div>
                          <p className="font-medium text-foreground">
                            {validationErrorCount} validation error{validationErrorCount === 1 ? '' : 's'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Fix errors above or download the error Excel
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Processing player data...</p>
                    )}
                  </div>

                  <div className="flex gap-3 shrink-0">
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
                      onClick={startImportFlow}
                      disabled={!canProceed || importPlayersMutation.isPending || isParsing}
                    >
                      {isParsing 
                        ? "Processing..." 
                        : importPlayersMutation.isPending 
                          ? "Importing..." 
                          : "Import players & continue"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={showSwissManagerTip} onOpenChange={setShowSwissManagerTip}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Swiss-Manager export tip</DialogTitle>
            <DialogDescription>
              Swiss-Manager → Output Points/Results → tick ‘Print all columns’ → Save as Excel
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            <img
              src={imgSrc}
              alt="Swiss-Manager export settings showing Print all columns option"
              className="max-w-full h-auto max-h-[70vh] object-contain"
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showTieRankDetails} onOpenChange={setShowTieRankDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tie rank imputation details</DialogTitle>
            <DialogDescription>
              Blank rank cells between tied entries were filled to keep continuous rankings for prize allocation.
            </DialogDescription>
          </DialogHeader>
          {tieRankReport?.rows.length ? (
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
                  {tieRankReport.rows.map((row) => (
                    <TableRow key={`${row.rowIndex}-${row.imputedRank}`}>
                      <TableCell>{row.excelRowNumber ?? row.rowIndex + 1}</TableCell>
                      <TableCell>{row.tieAnchorRank}</TableCell>
                      <TableCell>{row.imputedRank}</TableCell>
                      <TableCell>
                        {row.nextPrintedRank == null ? '(end of sheet)' : row.nextPrintedRank}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No imputed ranks to display.</p>
          )}
          {tieRankReport?.warnings.length ? (
            <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900">
              <div className="font-medium">Warnings</div>
              <ul className="mt-2 list-disc pl-5">
                {tieRankReport.warnings.map((warning) => (
                  <li key={`${warning.rowIndex}-${warning.message}`}>
                    Row {warning.excelRowNumber ?? warning.rowIndex + 1}: {warning.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={showDobImputationDetails} onOpenChange={setShowDobImputationDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>DOB year-only conversion details</DialogTitle>
            <DialogDescription>
              Year-only DOB values were converted to January 1 to keep imports compatible with the database.
            </DialogDescription>
          </DialogHeader>
          {dobImputationReport?.rows.length ? (
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
                  {dobImputationReport.rows.map((row) => (
                    <TableRow key={`${row.rowNumber}-${row.rank ?? 'na'}`}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>{row.rank ?? ''}</TableCell>
                      <TableCell>{row.dob_original ?? ''}</TableCell>
                      <TableCell>{row.dob_saved ?? ''}</TableCell>
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

      <ColumnMappingDialog
        open={showMappingDialog}
        onOpenChange={setShowMappingDialog}
        detectedColumns={headers}
        sampleRows={parsedData as Record<string, unknown>[]}
        onConfirm={handleMappingConfirm}
      />
      <DeduplicationWizard
        open={showDuplicateDialog}
        onOpenChange={setShowDuplicateDialog}
        candidates={dedupeState?.candidates ?? []}
        decisions={dedupeDecisions}
        summary={
          dedupeState?.summary ?? {
            totalCandidates: mappedPlayers.length,
            matchedCandidates: 0,
            defaultCreates: dedupeDecisions.filter(d => d.action === 'create').length,
            defaultUpdates: dedupeDecisions.filter(d => d.action === 'update').length,
            defaultSkips: dedupeDecisions.filter(d => d.action === 'skip').length,
            scoreThreshold: 0.45,
          }
        }
        mergePolicy={importConfig.mergePolicy}
        onMergePolicyChange={handleMergePolicyChange}
        onDecisionsChange={handleDecisionsChange}
        onConfirm={handleConfirmDuplicates}
      />
    </div>
  );
}
