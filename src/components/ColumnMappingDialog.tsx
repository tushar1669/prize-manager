import { useState } from "react";
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

interface ColumnMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detectedColumns: string[];
  onConfirm: (mapping: Record<string, string>) => void;
}

const requiredFields = [
  { key: 'rank', label: 'Rank (required)', description: 'Player rank/position in tournament' },
  { key: 'name', label: 'Name (required)', description: 'Player full name' }
];

const optionalFields = [
  { key: 'rating', label: 'Rating', description: 'Player rating (number)' },
  { key: 'dob', label: 'Date of Birth', description: 'Format: YYYY-MM-DD' },
  { key: 'gender', label: 'Gender', description: 'M, F, or Other' },
  { key: 'state', label: 'State', description: 'Player state/province' },
  { key: 'city', label: 'City', description: 'Player city' },
  { key: 'club', label: 'Club', description: 'Chess club or organization' },
  { key: 'disability', label: 'Disability', description: 'Disability type (e.g., Hearing, Visual)' },
  { key: 'special_notes', label: 'Special Notes', description: 'Special requirements or accommodations' }
];

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

const mappingRules: Record<string, string[]> = {
  // required
  rank: ['rank', 'position', 'pos', 'rank#', '#'],
  name: ['name', 'player', 'player name', 'full name', 'playername'],

  // existing optional
  rating: ['rating', 'elo', 'fide rating', 'elo rating', 'fide'],
  dob: ['dob', 'date of birth', 'birth date', 'd.o.b', 'birthdate'],
  gender: ['gender', 'sex', 'g'],
  state: ['state', 'province', 'region', 'st'],
  city: ['city', 'town', 'location'],

  // NEW optional (synonyms included; these are mapped only if headers exist)
  club: ['club', 'chess club', 'organization', 'academy'],
  disability: ['disability', 'disability type', 'handicap', 'ph', 'pwd', 'physically handicapped', 'special category'],
  special_notes: ['special notes', 'notes', 'remarks', 'special needs', 'accommodations', 'comments']
};

export function ColumnMappingDialog({ 
  open, 
  onOpenChange, 
  detectedColumns, 
  onConfirm 
}: ColumnMappingDialogProps) {
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    // Auto-detect common column names with fuzzy matching
    const autoMapping: Record<string, string> = {};
    
    detectedColumns.forEach(col => {
      const normalized = norm(col);
      Object.entries(mappingRules).forEach(([field, patterns]) => {
        if (!autoMapping[field] && patterns.some(pattern => normalized === pattern || normalized.includes(pattern))) {
          autoMapping[field] = col;
        }
      });
    });
    
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
