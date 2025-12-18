import { useState, useEffect, useCallback, useMemo } from "react";
import {
  HEADER_ALIASES,
  selectBestRatingColumn,
  normalizeHeaderForMatching,
  detectFullVsAbbrevName,
  getSampleValues,
} from "@/utils/importSchema";
import { isFeatureEnabled } from "@/utils/featureFlags";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, RotateCcw } from "lucide-react";
import { GenderDetectionChip } from "@/components/import/GenderDetectionChip";
import { analyzeGenderColumns, type GenderSource } from "@/utils/genderInference";

interface ColumnMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detectedColumns: string[];
  onConfirm: (mapping: Record<string, string>) => void;
  sampleRows: Record<string, any>[];
}

const requiredFields = [
  { key: 'rank', label: 'Rank (required)', description: 'Final player rank/position (NOT start number)' },
  { key: 'name', label: 'Name (required)', description: 'Player short/abbreviated name' }
];

const optionalFields = [
  { key: 'sno', label: 'Start Number (SNo)', description: 'Initial seed/start number (distinct from final rank)' },
  { key: 'full_name', label: 'Full Name', description: 'Unabridged player name (used for display)' },
  { key: 'rating', label: 'Rating', description: 'Player rating (Rtg preferred over IRtg)' },
  { key: 'dob', label: 'Date of Birth', description: 'Accepts: YYYY-MM-DD (full), YYYY/00/00 (year only), or YYYY. Partial dates assume Jan 1 for eligibility.' },
  { key: 'gender', label: 'Gender', description: 'M, F, or Other' },
  { key: 'fide_id', label: 'FIDE ID', description: 'FIDE identification number (for duplicate detection)' },
  { key: 'state', label: 'State', description: 'Player state/province' },
  { key: 'city', label: 'City', description: 'Player city' },
  { key: 'club', label: 'Club', description: 'Chess club or organization' },
  { key: 'gr', label: 'Group (Gr)', description: 'Swiss-Manager Gr column for category grouping (e.g., PC for differently-abled)' },
  { key: 'type', label: 'Type', description: 'Swiss-Manager Type column for section/category codes (U14, F11, S55, etc.)' },
  { key: 'disability', label: 'Disability', description: 'Disability type (e.g., Hearing, Visual)' },
  { key: 'special_notes', label: 'Special Notes', description: 'Special requirements or accommodations' },
  { key: 'unrated', label: 'Unrated', description: 'Whether player is unrated (Y/N)' }
];

// Use centralized aliases from importSchema
const mappingRules = HEADER_ALIASES;
const GENDER_DENYLIST = new Set(['fed', 'federation']);

export function ColumnMappingDialog({
  open,
  onOpenChange,
  detectedColumns,
  onConfirm,
  sampleRows
}: ColumnMappingDialogProps) {
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [genderDetection, setGenderDetection] = useState<
    { column: string; sample?: string; source: Extract<GenderSource, 'fs_column' | 'headerless_after_name'> }
    | null
  >(null);

  const columnOptions = detectedColumns.map((col, idx) => {
    const isPlaceholder = col.startsWith("__EMPTY_COL_");
    return {
      value: col,
      label: isPlaceholder ? `Empty column ${idx + 1} (unmapped)` : col,
      disabled: isPlaceholder
    };
  });

  // Auto-mapping logic extracted as useCallback
  const performAutoMapping = useCallback(() => {
    if (detectedColumns.length === 0) {
      return {};
    }
    
    console.log('[ColumnMapping] Initializing auto-map for', detectedColumns.length, 'columns');
    
    const autoMapping: Record<string, string> = {};
    const nameCandidates: string[] = [];

    // Rating priority (Phase 3)
    if (isFeatureEnabled('RATING_PRIORITY')) {
      const bestRating = selectBestRatingColumn(detectedColumns);
      if (bestRating) {
        autoMapping.rating = bestRating;
      }
    }

    const genderConfig = analyzeGenderColumns(sampleRows);
    const genderCandidate = genderConfig.preferredColumn;

    setGenderDetection(null);

    if (genderCandidate && !GENDER_DENYLIST.has(normalizeHeaderForMatching(genderCandidate))) {
      autoMapping.gender = genderCandidate;

      if (genderConfig.preferredSource === 'headerless_after_name' || genderConfig.preferredSource === 'fs_column') {
        const sampleValue = sampleRows?.[0]?.[genderCandidate];
        setGenderDetection({
          column: genderCandidate,
          sample: sampleValue ? String(sampleValue) : undefined,
          source: genderConfig.preferredSource,
        });
      }
    }

    // Pre-normalize aliases
    const normalizedAliases: Record<string, string[]> = {};
    Object.entries(mappingRules).forEach(([field, patterns]) => {
      normalizedAliases[field] = patterns.map(normalizeHeaderForMatching);
    });
    
    // Standard field mapping
    detectedColumns.forEach(col => {
      const normalized = normalizeHeaderForMatching(col);
      Object.entries(normalizedAliases).forEach(([field, patterns]) => {
        if (field === 'rating' && autoMapping.rating) return;
        if (!autoMapping[field] && patterns.includes(normalized)) {
          autoMapping[field] = col;
        }
      });

      if (normalizedAliases.name?.includes(normalized)) {
        nameCandidates.push(col);
      }
    });

    // Smart detection for duplicate Name columns (full vs abbreviated)
    if (nameCandidates.length >= 2) {
      const detection = detectFullVsAbbrevName(sampleRows, nameCandidates[0], nameCandidates[1]);
      if (detection) {
        console.log('[ColumnMapping] Detected full vs short name:', detection);
        autoMapping.name = detection.shortNameColumn;
        autoMapping.full_name = detection.fullNameColumn;
      } else {
        // Fallback: first Name -> name, second -> full_name
        autoMapping.name = nameCandidates[0];
        autoMapping.full_name = nameCandidates[1];
      }
    } else if (!autoMapping.full_name) {
      const explicitFullName = detectedColumns.find(col =>
        normalizedAliases.full_name?.includes(normalizeHeaderForMatching(col))
      );
      if (explicitFullName) {
        autoMapping.full_name = explicitFullName;
      }
    }

    if (!autoMapping.name && autoMapping.full_name) {
      autoMapping.name = autoMapping.full_name;
    }
    
    console.log('[ColumnMapping] Auto-mapped fields:', autoMapping);
    console.log('[ColumnMapping] Mapped field count:', Object.keys(autoMapping).length);
    
    return autoMapping;
  }, [detectedColumns, sampleRows]);

  // Auto-mapping useEffect - runs when detectedColumns changes
  useEffect(() => {
    const autoMapping = performAutoMapping();
    setMapping(autoMapping);
  }, [performAutoMapping]);

  const handleConfirm = () => {
    // Validate required fields
    if (!mapping.rank || !mapping.name) {
      return; // Button will be disabled anyway
    }
    onConfirm(mapping);
  };

  const handleReset = () => {
    console.log('[ColumnMapping] Resetting to defaults');
    const autoMapping = performAutoMapping();
    setMapping(autoMapping);
  };

  const isValid = !!mapping.rank && !!mapping.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle>Map File Columns</DialogTitle>
              <DialogDescription>
                Match your file columns to the required fields. Required fields must be mapped.
              </DialogDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleReset}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset to defaults
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Gender detection chip */}
          {genderDetection && mapping.gender === genderDetection.column && (
            <GenderDetectionChip
              columnName={genderDetection.column}
              sampleValue={genderDetection.sample}
              source={genderDetection.source}
            />
          )}
          {/* Phase 3: Rating priority notice */}
          {isFeatureEnabled('RATING_PRIORITY') && mapping.rating && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Rating mapped to <strong>{mapping.rating}</strong>.
                {detectedColumns.some(c => normalizeHeaderForMatching(c) === 'irtg') && 
                  detectedColumns.some(c => normalizeHeaderForMatching(c) === 'rtg') && 
                  ' (Rtg preferred over IRtg for current rating)'}
              </AlertDescription>
            </Alert>
          )}
          
          {/* Required Fields */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Required Fields</h3>
            <div className="space-y-4">
              {requiredFields.map(field => (
                <div key={field.key} className="grid gap-2">
                  <Label htmlFor={field.key}>
                    {field.label}
                    <span className="text-xs text-muted-foreground block">{field.description}</span>
                  </Label>
                  <Select
                    value={mapping[field.key]}
                    onValueChange={(value) => setMapping(prev => ({ ...prev, [field.key]: value }))}
                  >
                    <SelectTrigger id={field.key}>
                      <SelectValue placeholder="Select file column" />
                    </SelectTrigger>
                    <SelectContent>
                      {columnOptions.map(option => (
                        <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {/* Optional Fields */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Optional Fields</h3>
            <div className="space-y-4">
              {optionalFields.map(field => (
                <div key={field.key} className="grid gap-2">
                  <Label htmlFor={field.key}>
                    {field.label}
                    <span className="text-xs text-muted-foreground block">{field.description}</span>
                  </Label>
                  <Select
                    value={mapping[field.key] ?? "__skip__"}
                    onValueChange={(value) => {
                      if (value === "__skip__") {
                        const newMapping = { ...mapping };
                        delete newMapping[field.key];
                        setMapping(newMapping);
                      } else {
                        setMapping(prev => ({ ...prev, [field.key]: value }));
                      }
                    }}
                  >
                    <SelectTrigger id={field.key}>
                      <SelectValue placeholder="Skip this field" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__skip__">Skip this field</SelectItem>
                      {columnOptions.map(option => (
                        <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!isValid}>
            Confirm Mapping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
