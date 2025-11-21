import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ChevronDown, Settings } from 'lucide-react';
import { useState } from 'react';
import type { MergePolicy } from '@/utils/dedup';

interface MergePolicyAdvancedPanelProps {
  mergePolicy: MergePolicy;
  onMergePolicyChange: (policy: MergePolicy) => void;
}

export function MergePolicyAdvancedPanel({
  mergePolicy,
  onMergePolicyChange,
}: MergePolicyAdvancedPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-lg">
      <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-muted/50 transition-colors rounded-lg">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Advanced Merge Options</span>
        </div>
        <ChevronDown 
          className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </CollapsibleTrigger>
      
      <CollapsibleContent className="px-3 pb-3 pt-1 space-y-3">
        <div className="text-xs text-muted-foreground mb-3">
          These settings control how data is merged when updating existing players:
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <Label htmlFor="fill-blanks" className="text-sm font-medium">
              Only Fill Empty Fields
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              When enabled, only update fields that are currently empty in the database. 
              Existing data will not be overwritten.
            </p>
          </div>
          <Switch
            id="fill-blanks"
            checked={mergePolicy.fillBlanks}
            onCheckedChange={(checked) =>
              onMergePolicyChange({ ...mergePolicy, fillBlanks: checked })
            }
          />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <Label htmlFor="prefer-rating" className="text-sm font-medium">
              Prefer Higher Rating
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              When both import and database have ratings, keep the higher one 
              (assumes most recent rating is higher).
            </p>
          </div>
          <Switch
            id="prefer-rating"
            checked={mergePolicy.preferNewerRating}
            onCheckedChange={(checked) =>
              onMergePolicyChange({ ...mergePolicy, preferNewerRating: checked })
            }
          />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <Label htmlFor="never-dob" className="text-sm font-medium">
              Never Overwrite Date of Birth
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              Protect existing DOB data from being changed. Use this if your 
              database has verified DOB records.
            </p>
          </div>
          <Switch
            id="never-dob"
            checked={mergePolicy.neverOverwriteDob}
            onCheckedChange={(checked) =>
              onMergePolicyChange({ ...mergePolicy, neverOverwriteDob: checked })
            }
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
