import { useState } from "react";
import { HEADER_ALIASES, selectBestRatingColumn } from "@/utils/importSchema";
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
import { Info } from "lucide-react";

interface ColumnMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detectedColumns: string[];
  onConfirm: (mapping: Record<string, string>) => void;
}

const requiredFields = [
  { key: 'rank', label: 'Rank (required)', description: 'Final player rank/position (NOT start number)' },
  { key: 'name', label: 'Name (required)', description: 'Player full name' }
];

const optionalFields = [
  { key: 'sno', label: 'Start Number (SNo)', description: 'Initial seed/start number (distinct from final rank)' },
  { key: 'rating', label: 'Rating', description: 'Player rating (Rtg preferred over IRtg)' },
  { key: 'dob', label: 'Date of Birth', description: 'Accepts: YYYY-MM-DD (full), YYYY/00/00 (year only), or YYYY. Partial dates assume Jan 1 for eligibility.' },
  { key: 'gender', label: 'Gender', description: 'M, F, or Other' },
  { key: 'fide_id', label: 'FIDE ID', description: 'FIDE identification number (for duplicate detection)' },
  { key: 'state', label: 'State', description: 'Player state/province' },
  { key: 'city', label: 'City', description: 'Player city' },
  { key: 'club', label: 'Club', description: 'Chess club or organization' },
  { key: 'disability', label: 'Disability', description: 'Disability type (e.g., Hearing, Visual)' },
  { key: 'special_notes', label: 'Special Notes', description: 'Special requirements or accommodations' },
  { key: 'unrated', label: 'Unrated', description: 'Whether player is unrated (Y/N)' }
];

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

// Use centralized aliases from importSchema
const mappingRules = HEADER_ALIASES;

export function ColumnMappingDialog({ 
  open, 
  onOpenChange, 
  detectedColumns, 
  onConfirm 
}: ColumnMappingDialogProps) {
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    // Phase 2-4: Enhanced auto-detection with rating priority
    const autoMapping: Record<string, string> = {};
    
    // Phase 3: Special handling for rating column priority (Rtg > IRtg)
    if (isFeatureEnabled('RATING_PRIORITY')) {
      const bestRating = selectBestRatingColumn(detectedColumns);
      if (bestRating) {
        autoMapping.rating = bestRating;
      }
    }
    
    // Standard field auto-mapping
    detectedColumns.forEach(col => {
      const normalized = norm(col);
      Object.entries(mappingRules).forEach(([field, patterns]) => {
        // Skip rating if already handled by priority logic
        if (field === 'rating' && autoMapping.rating) return;
        
        if (!autoMapping[field] && patterns.some(pattern => {
          const normPattern = norm(pattern);
          return normalized === normPattern || normalized.includes(normPattern);
        })) {
          autoMapping[field] = col;
        }
      });
    });
    
    console.log('[ColumnMapping] Auto-mapped fields:', autoMapping);
    
    return autoMapping;
  });

  const handleConfirm = () => {
    // Validate required fields
    if (!mapping.rank || !mapping.name) {
      return; // Button will be disabled anyway
    }
    onConfirm(mapping);
  };

  const isValid = !!mapping.rank && !!mapping.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Map File Columns</DialogTitle>
          <DialogDescription>
            Match your file columns to the required fields. Required fields must be mapped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Phase 3: Rating priority notice */}
          {isFeatureEnabled('RATING_PRIORITY') && mapping.rating && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Rating mapped to <strong>{mapping.rating}</strong>.
                {detectedColumns.some(c => norm(c) === 'irtg') && 
                  detectedColumns.some(c => norm(c) === 'rtg') && 
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
                      {detectedColumns.map(col => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
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
                      {detectedColumns.map(col => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
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
