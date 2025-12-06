import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { GenderSource } from "@/utils/genderInference";

export type GenderDetectionStatus = 'ok' | 'soft_warning' | 'hard_warning';

interface GenderSummaryChipProps {
  femaleFromGender: number;
  maleFromGender: number;
  femaleFromFmg: number;
  sources: GenderSource[];
  totalPlayers: number;
}

function getSourceLabel(sources: GenderSource[]): string {
  const uniqueSources = Array.from(new Set(sources.filter(s => s)));
  
  const hasFs = uniqueSources.includes('fs_column');
  const hasHeaderless = uniqueSources.includes('headerless_after_name');
  const hasGenderCol = uniqueSources.includes('gender_column');
  const hasFmg = uniqueSources.includes('type_label') || uniqueSources.includes('group_label');

  const parts: string[] = [];
  if (hasGenderCol) parts.push('gender');
  if (hasFs) parts.push('fs');
  if (hasHeaderless) parts.push('headerless');
  if (hasFmg) parts.push('FMG');
  
  if (parts.length === 0) return 'unknown';
  return parts.join(' + ');
}

function getStatus(femaleFromGender: number, femaleFromFmg: number): GenderDetectionStatus {
  // Hard warning: gender column shows 0 females but FMG shows some
  if (femaleFromGender === 0 && femaleFromFmg > 0) {
    return 'hard_warning';
  }
  
  // Soft warning: both present but differ significantly (> 2)
  if (femaleFromGender > 0 && femaleFromFmg > 0) {
    const diff = Math.abs(femaleFromGender - femaleFromFmg);
    if (diff > 2) {
      return 'soft_warning';
    }
  }
  
  return 'ok';
}

export function GenderSummaryChip({ 
  femaleFromGender, 
  maleFromGender, 
  femaleFromFmg, 
  sources,
  totalPlayers 
}: GenderSummaryChipProps) {
  const status = getStatus(femaleFromGender, femaleFromFmg);
  const sourceLabel = getSourceLabel(sources);
  
  // Don't render if no players
  if (totalPlayers === 0) return null;

  const renderIcon = () => {
    switch (status) {
      case 'ok':
        return <CheckCircle2 className="h-3 w-3" />;
      case 'soft_warning':
        return <AlertTriangle className="h-3 w-3" />;
      case 'hard_warning':
        return <XCircle className="h-3 w-3" />;
    }
  };

  const getBadgeVariant = (): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'ok':
        return 'secondary';
      case 'soft_warning':
        return 'outline';
      case 'hard_warning':
        return 'destructive';
    }
  };

  const getBadgeClassName = (): string => {
    switch (status) {
      case 'ok':
        return 'gap-1 cursor-help';
      case 'soft_warning':
        return 'gap-1 cursor-help border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-700';
      case 'hard_warning':
        return 'gap-1 cursor-help';
    }
  };

  const renderChipContent = () => {
    switch (status) {
      case 'ok':
        return (
          <>
            Gender: OK · {femaleFromGender}F / {maleFromGender}M ({sourceLabel})
          </>
        );
      case 'soft_warning':
        return (
          <>
            Gender mismatch · gender={femaleFromGender}F, FMG={femaleFromFmg}F
          </>
        );
      case 'hard_warning':
        return (
          <>
            No females via gender column, but FMG={femaleFromFmg}
          </>
        );
    }
  };

  const renderHoverContent = () => {
    const detectionExplanation = (
      <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
        Prize-Manager reads gender from explicit gender columns, the FS column, 
        headerless F markers between Name and Rating, and girl-specific groups like FMG/F13.
      </p>
    );

    switch (status) {
      case 'ok':
        return (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Gender detection OK
            </h4>
            <p className="text-sm text-muted-foreground">
              Gender values were detected from: <strong>{sourceLabel}</strong>
            </p>
            <div className="text-sm">
              <div>Female: <strong>{femaleFromGender}</strong></div>
              <div>Male: <strong>{maleFromGender}</strong></div>
              {femaleFromFmg > 0 && (
                <div className="text-muted-foreground mt-1">
                  FMG labels found: {femaleFromFmg} (consistent)
                </div>
              )}
            </div>
            {detectionExplanation}
          </div>
        );
      case 'soft_warning':
        return (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Gender counts differ
            </h4>
            <p className="text-sm text-muted-foreground">
              The gender column shows <strong>{femaleFromGender}</strong> females, 
              but FMG labels in Type/Gr indicate <strong>{femaleFromFmg}</strong>.
            </p>
            <p className="text-sm text-muted-foreground">
              Please double-check your gender and Type/Group column mapping.
            </p>
            {detectionExplanation}
          </div>
        );
      case 'hard_warning':
        return (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <XCircle className="h-4 w-4 text-destructive" />
              Gender column missing female values
            </h4>
            <p className="text-sm text-muted-foreground">
              The gender column shows <strong>0</strong> females, but FMG labels 
              in Type/Gr indicate <strong>{femaleFromFmg}</strong> female players.
            </p>
            <p className="text-sm text-muted-foreground">
              This may cause female categories to fail during allocation.
              Check your column mapping or ensure the gender column is populated.
            </p>
            {detectionExplanation}
          </div>
        );
    }
  };

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Badge variant={getBadgeVariant()} className={getBadgeClassName()}>
          {renderIcon()}
          {renderChipContent()}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        {renderHoverContent()}
      </HoverCardContent>
    </HoverCard>
  );
}
