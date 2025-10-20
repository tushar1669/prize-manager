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
  { key: 'city', label: 'City', description: 'Player city' }
];

export function ColumnMappingDialog({ 
  open, 
  onOpenChange, 
  detectedColumns, 
  onConfirm 
}: ColumnMappingDialogProps) {
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    // Auto-detect common column names
    const autoMapping: Record<string, string> = {};
    
    detectedColumns.forEach(col => {
      const lower = col.toLowerCase().trim();
      if (lower === 'rank' || lower === 'position' || lower === 'pos') autoMapping.rank = col;
      if (lower === 'name' || lower === 'player' || lower === 'player name') autoMapping.name = col;
      if (lower === 'rating' || lower === 'elo') autoMapping.rating = col;
      if (lower === 'dob' || lower === 'date of birth' || lower === 'birth date') autoMapping.dob = col;
      if (lower === 'gender' || lower === 'sex') autoMapping.gender = col;
      if (lower === 'state' || lower === 'province') autoMapping.state = col;
      if (lower === 'city' || lower === 'town') autoMapping.city = col;
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
                    value={mapping[field.key] || ""}
                    onValueChange={(value) => setMapping(prev => ({ ...prev, [field.key]: value }))}
                  >
                    <SelectTrigger id={field.key}>
                      <SelectValue placeholder="Select CSV column" />
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
                    value={mapping[field.key] || "skip"}
                    onValueChange={(value) => {
                      if (value === "skip") {
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
                      <SelectItem value="skip">Skip this field</SelectItem>
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
